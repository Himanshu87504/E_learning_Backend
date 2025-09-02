import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";
import { v4 as uuid } from "uuid";

// Cloudinary storage for images & videos
const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "course_uploads",
    public_id: uuid(),
    resource_type: file.mimetype.startsWith("video") ? "video" : "image",
    format: file.mimetype.split("/")[1],
  }),
});

export const uploadFiles = multer({ storage }).single("file");
