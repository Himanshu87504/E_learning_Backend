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
  if (!course) return res.status(404).json({ message: "Course not found" });
  res.json({ course });
});

// ✅ Get lectures for a course
export const fetchLectures = TryCatch(async (req, res) => {
  const lectures = await Lecture.find({ course: req.params.id });
  const user = await User.findById(req.user._id);

  if (user.role === "admin" || user.subscription.includes(req.params.id)) {
    return res.json({ lectures });
  }

  res.status(403).json({ message: "You have not subscribed to this course" });
});

// ✅ Get a single lecture
export const fetchLecture = TryCatch(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id);
  const user = await User.findById(req.user._id);

  if (!lecture) return res.status(404).json({ message: "Lecture not found" });

  if (user.role === "admin" || user.subscription.includes(lecture.course)) {
    return res.json({ lecture });
  }

  res.status(403).json({ message: "You have not subscribed to this course" });
});

// ✅ Get my courses
export const getMyCourses = TryCatch(async (req, res) => {
  const courses = await Courses.find({ _id: req.user.subscription });
  res.json({ courses });
});

// ✅ Stripe Checkout
export const checkout = TryCatch(async (req, res) => {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });

  const user = await User.findById(req.user._id);
  if (!user) return res.status(404).json({ message: "User not found" });

  const course = await Courses.findById(req.params.id);
  if (!course) return res.status(404).json({ message: "Course not found" });

  if (user.subscription.some(id => id.toString() === course._id.toString())) {
    return res.status(400).json({ message: "You already have this course" });
  }

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
          unit_amount: Math.round(course.price * 100), // Convert to paise
        },
        quantity: 1,
      },
    ],
    mode: "payment",
      success_url:`https://elearning-frontend-3k7r.vercel.app/payment-success?session_id={CHECKOUT_SESSION_ID}&courseId=${course._id}`,    
      cancel_url:"https://elearning-frontend-3k7r.vercel.app/payment/failed",
  });

  return res.status(201).json({
    url: session.url,
    sessionId: session.id,
    courseId: course._id,
  });
});

export const paymentVerification = TryCatch(async (req, res) => {


  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { session_id } = req.body;
  const courseId = req.params.id;

  if (!session_id || !courseId) {
    return res.status(400).json({ message: "Session ID and Course ID are required" });
  }

  // Retrieve session from Stripe
  const session = await stripe.checkout.sessions.retrieve(session_id);
  if (!session) {
    return res.status(404).json({ message: "Stripe session not found" });
  }

  if (session.payment_status === "paid") {
    // Save payment info if not already saved
    let payment = await Payment.findOne({ stripe_session_id: session.id });
    if (!payment) {
      payment = await Payment.create({
        stripe_session_id: session.id,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        customer_email: session.customer_details?.email,
      });
    }

    const user = await User.findById(req.user._id);
    const course = await Courses.findById(courseId);

    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Check if user already subscribed
    const alreadySubscribed = user.subscription.some((id) =>
      id.equals(course._id)
    );

    if (!alreadySubscribed) {
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
        image: course.image,
      },
    });
  } else {
    return res.status(400).json({ message: "Payment Failed" });
  }
});
// ✅ Add Progress
export const addProgress = TryCatch(async (req, res) => {
  const progress = await Progress.findOne({ user: req.user._id, course: req.query.course });
  const { lectureId } = req.query;

  if (!progress) return res.status(404).json({ message: "Progress not found" });

  if (!progress.completedLectures.includes(lectureId)) {
    progress.completedLectures.push(lectureId);
    await progress.save();
  }

  res.status(201).json({ message: "Progress recorded" });
});

// ✅ Get Progress
export const getYourProgress = TryCatch(async (req, res) => {
  const progress = await Progress.find({ user: req.user._id, course: req.query.course });
  if (!progress || !progress.length) return res.status(404).json({ message: "No progress found" });

  const allLectures = (await Lecture.find({ course: req.query.course })).length;
  const completedLectures = progress[0].completedLectures.length;
  const courseProgressPercentage = (completedLectures * 100) / allLectures;

  res.json({ courseProgressPercentage, completedLectures, allLectures, progress });
});
