import mongoose from "mongoose";

const schema = new mongoose.Schema({
  stripe_session_id: {
    type: String,
    required: true,
  },
  payment_status: {
    type: String,
    required: true,
    enum: ["paid", "unpaid", "no_payment_required"],
  },
  amount_total: {
    type: Number,
    required: true,
  },
  customer_email: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const Payment = mongoose.model("Payment", schema);
