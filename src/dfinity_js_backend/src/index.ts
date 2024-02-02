//Backend for logic core canister
import { query, update, text, Record, StableBTreeMap, Variant, Vec, None, Some, Ok, Err, ic, Principal, Opt, nat64, Duration, Result, bool, Canister } from "azle";
import {
    Ledger, binaryAddressFromAddress, binaryAddressFromPrincipal, hexAddressFromPrincipal
} from "azle/canisters/ledger"

import { hashCode } from "hashcode";
import { v4 as uuidv4} from "uuid";

// defining record and variant types
// * It contains basic properties that are needed to define a product.
const Product = Record({
    id: text,
    title: text,
    description: text,
    price: nat64,
    location: text,
    attachmentURL: text,
    soldAmount: nat64,
    seller: Principal,
});

const ProductPayload = Record({
    title: text,
    description: text,
    price: nat64,
    location: text,
    attachmentURL: text,
});

const OrderStatus = Variant({
    PaymentPending: text,
    PaymentComplete: text,
});

const Order = Record({
    id: text,
    product: Product,
    buyer: Principal,
    status: OrderStatus,
    createdAt: text,
    updatedAt: text,
    paid_at_block: Opt(nat64), // optional record the block when payment was made
    memo: nat64,
});

const Message = Variant({
    NotFound: text,
    InvalidPayload: text,
    PaymentFailed: text,
    PaymentComplete: text,
});

/**
 * `productsStorage` - it's a key-value data structure used to store products listed by sellers in the marketplace.
 * {@link StableBTreeMap} is a self-balancing tree acting as durable data storage that preserves data across canister upgrades.
 * For this contract, we've chosen {@link StableBTreeMap} for several reasons:
 * - `insert`, `get`, and `remove` operations have a constant time complexity of O(1).
 * - Data stored in this map persists across canister upgrades, unlike using a HashMap where data is stored in the heap and can be lost after a canister upgrade.
 */
const productsStorage = StableBTreeMap(text, Product, 0);

/**
 * `persistedOrders` and `pendingOrders` are also instances of {@link StableBTreeMap}.
 * These data structures are used to manage and store orders within the marketplace.
 */
const persistedOrders = StableBTreeMap(text, Order, 1);
const pendingOrders = StableBTreeMap(nat64, Order, 2);

/**
 * `ORDER_RESERVATION_PERIOD` is a constant that defines the reservation period for orders in seconds.
 * This period allows users to reserve products for a specific duration before completing the purchase.
 */
const ORDER_RESERVATION_PERIOD = 120n;

/**
 * Initialization of the Ledger canister, which handles financial transactions and ledger operations.
 * The principal text value is hardcoded here, as it is set in the `dfx.json` configuration.
 */
const icpCanister = Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));

// Define Query and Update functions
getProduct: query([text], Result(Product, Message), (id) => {
    const productOpt = productsStorage.get(id);
    if ("None" in productOpt) {
        return Err({ NotFound: `product with id=${id} not found` });
    }
    return Ok(productOpt.Some);
}),

addProduct: update([ProductPayload], Result(Product, Message), (payload) => {
    if (typeof payload !== "object" || Object.keys(payload).length === 0) {
        return Err({ NotFound: "invalid payoad" })
    }
    const product = { id: uuidv4(), soldAmount: 0n, seller: ic.caller(), ...payload };
    productsStorage.insert(product.id, product);
    return Ok(product);
}),

updateProduct: update([Product], Result(Product, Message), (payload) => {
    const productOpt = productsStorage.get(payload.id);
    if ("None" in productOpt) {
        return Err({ NotFound: `product with id=${payload.id} not found` });
    }
    productsStorage.insert(payload.id, payload);
    return Ok(payload);
}),

deleteProduct: update([text], Result(text, Message), (id) => {
    const productOpt = productsStorage.get(id);
    if ("None" in productOpt) {
        return Err({ NotFound: `product with id=${id} not found` });
    }
    productsStorage.remove(id);
    return Ok(null);
}),

// The entire flow is divided into the three main parts:
//             1. Create an order
//             2. Pay for the order (transfer ICP to the seller). 
//             3. Complete the order (use memo from step 1 and the transaction block from step 2)

createOrder: update([text], Result(Order, Message), (id) => {
    const productOpt = productsStorage.get(id);
    if ("None" in productOpt) {
        return Err({ NotFound: `product with id=${id} not found` });
    }
    const product = productOpt.Some;
    const order = {
        id: uuidv4(),
        product,
        buyer: ic.caller(),
        status: { PaymentPending: "PaymentPending" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        paid_at_block: None,
        memo: generateCOrrelationId(),
    };
    persistedOrders.insert(order.id, order);
    pendingOrders.insert(Date.now(), order);
    discardByTimeout(Date.now());
    return Ok(order);
}),