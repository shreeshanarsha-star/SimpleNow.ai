import archiver from "archiver";
import { PassThrough } from "stream";

// Streams a set of named file buffers into a single zip buffer, for the
// dashboard's "Download zip" bulk-export action.
export async function zipFiles(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];

    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    archive.pipe(stream);
    for (const f of files) archive.append(f.buffer, { name: f.name });
    archive.finalize();
  });
}
