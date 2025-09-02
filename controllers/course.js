import TryCatch from "../middlewares/TryCatch.js";
import { Courses } from "../models/Courses.js";
import { Lecture } from "../models/Lecture.js";
import { User } from "../models/User.js";
import { Payment } from "../models/Payment.js";
import { Progress } from "../models/Progress.js";
import Stripe from "stripe";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.Stripe_Secret_Key);

// ✅ Get all courses
export const getAllCourses = TryCatch(async (req, res) => {
  const courses = await Courses.find().select("-__v");
  res.json({ courses });
});

// ✅ Get single course
export const getSingleCourse = TryCatch(async (req, res) => {
  const course = await Courses.findById(req.params.id).select("-__v");
  res.json({ course });
});

// ✅ Fetch all lectures of a course
export const fetchLectures = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const lectures = await Lecture.find({ course: req.params.id }).select("-__v");
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (user.role === "admin") return res.json({ lectures });
  if (!user.subscription.includes(req.params.id))
    return res.status(400).json({ message: "You have not subscribed to this course" });

  res.json({ lectures });
});

// ✅ Fetch single lecture
export const fetchLecture = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const lecture = await Lecture.findById(req.params.id).select("-__v");
  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  if (user.role === "admin") return res.json({ lecture });
  if (!user.subscription.includes(lecture.course))
    return res.status(400).json({ message: "You have not subscribed to this course" });

  res.json({ lecture });
});

// ✅ Get my subscribed courses
export const getMyCourses = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const courses = await Courses.find({ _id: { $in: req.user.subscription } }).select("-__v");
  res.json({ courses });
});

// ✅ Stripe Checkout
export const checkout = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const user = await User.findById(req.user._id);
  const course = await Courses.findById(req.params.id);
  if (!course) return res.status(404).json({ message: "Course not found" });

  if (user.subscription.includes(course._id))
    return res.status(400).json({ message: "You already have this course" });

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "inr",
          product_data: {
            name: course.title,
            description: course.description,
          },
          unit_amount: Number(course.price * 100),
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.frontendurl}/payment-success?session_id={CHECKOUT_SESSION_ID}&courseId=${course._id}`,
    cancel_url: `${process.env.frontendurl}/payment/failed`,
  });

  res.status(201).json({
    url: session.url,
    sessionId: session.id,
    courseId: course._id,
  });
});

// ✅ Payment Verification
export const paymentVerification = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ message: "Session ID is required" });

  const session = await stripe.checkout.sessions.retrieve(session_id);
  if (!session) return res.status(404).json({ message: "Stripe session not found" });

  if (session.payment_status === "paid") {
    await Payment.create({
      stripe_session_id: session.id,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      customer_email: session.customer_details?.email,
    });

    const user = await User.findById(req.user._id);
    const course = await Courses.findById(req.params.id);
    if (!user || !course) return res.status(404).json({ message: "User or Course not found" });

    if (!user.subscription.includes(course._id)) {
      user.subscription.push(course._id);
      await Progress.create({
        course: course._id,
        completedLectures: [],
        user: req.user._id,
      });
      await user.save();
    }

    return res.status(200).json({
      success: true,
      message: "Course Purchased Successfully",
      course: {
        _id: course._id,
        title: course.title,
        description: course.description,
        image: course.image, // Cloudinary URL
      },
    });
  } else {
    return res.status(400).json({ message: "Payment Failed" });
  }
});

// ✅ Add Progress
export const addProgress = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const progress = await Progress.findOne({
    user: req.user._id,
    course: req.query.course,
  });
  if (!progress) return res.status(404).json({ message: "Progress not found" });

  const { lectureId } = req.query;
  if (!progress.completedLectures.includes(lectureId)) {
    progress.completedLectures.push(lectureId);
    await progress.save();
  }

  res.status(201).json({ message: "Progress updated" });
});

// ✅ Get Progress
export const getYourProgress = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const progress = await Progress.findOne({
    user: req.user._id,
    course: req.query.course,
  });
  if (!progress) return res.status(404).json({ message: "Progress not found" });

  const allLectures = await Lecture.countDocuments({ course: req.query.course });
  const completedLectures = progress.completedLectures.length;
  const courseProgressPercentage = (completedLectures * 100) / (allLectures || 1);

  res.json({
    courseProgressPercentage,
    completedLectures,
    allLectures,
    progress,
  });
});
