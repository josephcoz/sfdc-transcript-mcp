import { describe, it, expect, vi } from "vitest";
import { logger } from "../src/logger.js";

describe("logger", () => {
  it("logs via console.error (stderr), never console.log (stdout/JSON-RPC channel)", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      logger.info("hello", { a: 1 });
      logger.warn("careful");
      logger.error("boom");
      expect(log).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(3);
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("never writes raw bytes to process.stdout", () => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      logger.info("hello");
      expect(out).not.toHaveBeenCalled();
    } finally {
      out.mockRestore();
    }
  });
});
