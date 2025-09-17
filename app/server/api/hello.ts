import fs from "fs";
import path from "path";

export default defineEventHandler(async (event) => {
  try {
    // Read files in current directory
    const files = await fs.promises.readdir("./public");

    // Filter only images
    const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
    const images = files.filter((file) =>
      imageExtensions.includes(path.extname(file).toLowerCase())
    );

    return {
      files: images,
    };
  } catch (err) {
    return {
      error: "Failed to read directory",
      details: err.message,
    };
  }
});
