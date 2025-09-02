import TryCatch from "../middlewares/TryCatch.js";
import { Courses } from "../models/Courses.js";
import { Lecture } from "../models/Lecture.js";
import { User } from "../models/User.js";
import cloudinary from "../config/cloudinary.js";

// Create a new course
export const createCourse = TryCatch(async (req, res) => {
  const { title, description, category, createdBy, duration, price } = req.body;
  const image = req.file;

  await Courses.create({
    title,
    description,
    category,
    createdBy,
    image: image?.path,          // Cloudinary URL
    imagePublicId: image?.filename, // Cloudinary public_id
    duration,
    price,
  });

  res.status(201).json({ message: "Course Created Successfully" });
});

// Add lecture to a course
export const addLectures = TryCatch(async (req, res) => {
  const course = await Courses.findById(req.params.id);
  if (!course) return res.status(404).json({ message: "No Course with this id" });

  const { title, description } = req.body;
  const file = req.file;

  const lecture = await Lecture.create({
    title,
    description,
    video: file?.path,          // Cloudinary URL
    videoPublicId: file?.filename, // Cloudinary public_id
    course: course._id,
  });

  res.status(201).json({ message: "Lecture Added", lecture });
});

// Delete a lecture
export const deleteLecture = TryCatch(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id);
  if (lecture.videoPublicId) {
    await cloudinary.uploader.destroy(lecture.videoPublicId, { resource_type: "video" });
  }
  await lecture.deleteOne();

  res.json({ message: "Lecture Deleted" });
});

// Delete a course and its lectures
export const deleteCourse = TryCatch(async (req, res) => {
  const course = await Courses.findById(req.params.id);
  const lectures = await Lecture.find({ course: course._id });

  // Delete lecture videos
  await Promise.all(
    lectures.map(async (lecture) => {
      if (lecture.videoPublicId) {
        await cloudinary.uploader.destroy(lecture.videoPublicId, { resource_type: "video" });
      }
      await lecture.deleteOne();
    })
  );

  // Delete course image
  if (course.imagePublicId) {
    await cloudinary.uploader.destroy(course.imagePublicId, { resource_type: "image" });
  }

  await User.updateMany({}, { $pull: { subscription: req.params.id } });
  await course.deleteOne();

  res.json({ message: "Course Deleted" });
});

// Get all stats
export const getAllStats = TryCatch(async (req, res) => {
  const totalCourses = await Courses.countDocuments();
  const totalLectures = await Lecture.countDocuments();
  const totalUsers = await User.countDocuments();

  res.json({
    stats: { totalCourses, totalLectures, totalUsers },
  });
});

// Get all users (except current)
export const getAllUser = TryCatch(async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user._id } }).select("-password");
  res.json({ users });
});

// Update user role
export const updateRole = TryCatch(async (req, res) => {
  if (req.user.mainrole !== "superadmin")
    return res.status(403).json({ message: "Only superadmin can update roles" });

  const user = await User.findById(req.params.id);

  if (user.role === "user") {
    user.role = "admin";
    await user.save();
    return res.status(200).json({ message: "Role updated to admin" });
  }

  if (user.role === "admin") {
    user.role = "user";
    await user.save();
    return res.status(200).json({ message: "Role updated to user" });
  }
});
