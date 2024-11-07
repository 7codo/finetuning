import fs from "fs";
import path from "path";
import { isText, isBinary, getEncoding } from "istextorbinary";

// Configuration constants
const CONFIG = {
  excluded: {
    directories: [
      "node_modules",
      ".git",
      ".next",
      "dist",
      "build",
      ".cache",
      ".vscode",
      "coverage",
    ],
    patterns: [/^\./], // Files/folders starting with dot
  },
  limits: {
    maxFileSizeBytes: 1000000, // 1MB
    maxLineLength: 500, // Maximum characters per line
    maxFileLines: 1000, // Maximum number of lines per file
  },
  unsupportedExtensions: [".yaml", ".svg", ".ttf"],
  unsupportedFiles: ["package-lock.json"],
};

class DatasetGenerator {
  constructor(options = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.outputPath = options.outputPath || "./dataset";
    this.systemPrompt =
      options.systemPrompt || "You are a helpful coding assistant.";
    this.outputFormat = options.outputFormat || "jsonl";
    this.fileName = options.fileName || "dataset";
    this.stats = {
      processedFiles: 0,
      skippedFiles: 0,
      totalSize: 0,
      errors: [],
    };
  }

  isValidFile(filePath, stats) {
    const ext = path.extname(filePath);
    const relativePath = path.relative(this.repoPath, filePath);

    // Check exclusions
    if (CONFIG.excluded.directories.some((dir) => relativePath.includes(dir))) {
      this.stats.skippedFiles++; // Increment skipped files count
      return false;
    }
    if (isBinary(filePath)) {
      // Exclude binary files and .woff files
      this.stats.skippedFiles++; // Increment skipped files count
      return false; // Exclude binary files
    }

    if (CONFIG.unsupportedExtensions.includes(ext)) {
      console.log("🎁 unsupported extensions", filePath);
      this.stats.skippedFiles++; // Increment skipped files count
      return false; // Exclude unsupported file types
    }

    if (CONFIG.unsupportedFiles.includes(path.basename(filePath))) {
      this.stats.skippedFiles++; // Increment skipped files count
      return false; // Exclude unsupported files
    }

    if (stats.size > CONFIG.limits.maxFileSizeBytes) {
      console.log("🎶 exceed max limit", filePath);
      this.stats.skippedFiles++; // Increment skipped files count
      return false;
    }

    this.stats.processedFiles++; // Increment processed files count
    return true;
  }

  async readFileContent(filePath) {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      // Apply content constraints
      if (lines.length > CONFIG.limits.maxFileLines) {
        return null;
      }

      const validLines = lines.filter(
        (line) =>
          line.trim().length > 0 && line.length <= CONFIG.limits.maxLineLength
      );

      return validLines.join("\n");
    } catch (error) {
      this.stats.errors.push({ file: filePath, error: error.message });
      return null;
    }
  }

  generateConversation(filePath, content) {
    const relativePath = path
      .relative(this.repoPath, filePath)
      .replace(/\\/g, "/");
    const fileType = path.extname(filePath).slice(1);

    return {
      messages: [
        {
          role: "system",
          content: this.systemPrompt,
        },
        {
          role: "user",
          content: `Please write the code of this ${fileType} file: ${relativePath}`,
        },
        // Assistant message
        {
          role: "assistant",
          content: content,
        },
      ],
    };
  }

  async traverseDirectory(dir) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = [];
    let fileCounts = 0;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.traverseDirectory(fullPath)));
      } else if (entry.isFile()) {
        const stats = await fs.promises.stat(fullPath);

        if (this.isValidFile(fullPath, stats)) {
          /* console.log("🚀 valid file", fullPath); */

          files.push(fullPath);
          this.stats.totalSize += stats.size;
        } else {
          this.stats.skippedFiles++;
        }
      }
      fileCounts++;
    }

    return files;
  }

  async generateDataset() {
    console.log(`Starting dataset generation from: ${this.repoPath}`);

    // Create output directory if it doesn't exist
    await fs.promises.mkdir(this.outputPath, { recursive: true });

    const outputFile = path.join(
      this.outputPath,
      `${this.fileName}.${this.outputFormat}`
    );
    const files = await this.traverseDirectory(this.repoPath);

    // Clear output file
    await fs.promises.writeFile(outputFile, "");

    for (const file of files) {
      const content = await this.readFileContent(file);

      if (content) {
        const conversation = this.generateConversation(file, content);
        await fs.promises.appendFile(
          outputFile,
          JSON.stringify(conversation) + "\n"
        );
      }
    }

    // Log the counts of processed and skipped files
    console.log(`Total Processed Files: ${this.stats.processedFiles}`);
    console.log(`Total Skipped Files: ${this.stats.skippedFiles}`);

    this.printStats();
  }

  printStats() {
    /*   console.log("\nDataset Generation Statistics:");
    console.log("----------------------------");
    console.log(`Processed Files: ${this.stats.processedFiles}`);
    console.log(`Skipped Files: ${this.stats.skippedFiles}`);
    console.log(
      `Total Size: ${(this.stats.totalSize / 1024 / 1024).toFixed(2)} MB`
    );
    console.log(`Errors: ${this.stats.errors.length}`); */

    if (this.stats.errors.length > 0) {
      console.log("\nErrors encountered:");
      this.stats.errors.forEach(({ file, error }) => {
        console.log(`- ${file}: ${error}`);
      });
    }
  }
}

// Example usage with custom file name
const generator = new DatasetGenerator({
  repoPath: "C:\\Users\\Ayoub\\Desktop\\code\\reposet\\initiate-nextjs-project",
  outputPath: "./datasets",
  fileName: "initiate-nextjs-project",
  systemPrompt: `You are a senior software engineer tasked with creating a Next.js project. Use TypeScript, ESLint, and TailwindCSS, and implement the App Router. Do not use Turbopack.`,
  outputFormat: "jsonl",
});

generator
  .generateDataset()
  .catch((error) => console.error("Error generating dataset:", error));
