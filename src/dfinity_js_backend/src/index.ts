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

