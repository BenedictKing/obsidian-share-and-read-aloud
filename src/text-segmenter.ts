import { DEFAULT_MAX_SEGMENT_CHARS } from "./constants";

export interface TextSegment {
  text: string;
  /** 0-indexed start line in the original (pre-normalized) document */
  startLine: number;
  /** 0-indexed end line (inclusive) */
  endLine: number;
  /** 0-indexed segment index */
  index: number;
}

/**
 * Split normalized text into segments suitable for TTS synthesis.
 * Strategy: paragraphs → sentences (CJK-aware) → commas, respecting max chars.
 * @param lineOffset - Base line offset in the original editor document
 */
export function segmentText(
  text: string,
  maxChars: number = DEFAULT_MAX_SEGMENT_CHARS,
  lineOffset: number = 0
): TextSegment[] {
  if (!text.trim()) return [];

  // Defensively clamp persisted or programmatic values.
  const safeMaxChars = maxChars > 0 ? maxChars : DEFAULT_MAX_SEGMENT_CHARS;

  const paragraphs = splitParagraphs(text);
  const rawSegments: { text: string; lineOffset: number }[] = [];

  for (const para of paragraphs) {
    if (para.text.length <= safeMaxChars) {
      rawSegments.push(para);
    } else {
      const subSegments = splitLongParagraph(para.text, safeMaxChars);
      for (const sub of subSegments) {
        rawSegments.push({ text: sub, lineOffset: para.lineOffset });
      }
    }
  }

  // Map line offsets to line ranges and assign indices.
  // Use the paragraph's original lineOffset + document lineOffset.
  return rawSegments
    .filter((s) => s.text.trim().length > 0)
    .map((s, index) => {
      const lineCount = countLines(s.text);
      const startLine = s.lineOffset + lineOffset;
      const endLine = s.lineOffset + lineCount - 1 + lineOffset;
      return {
        text: s.text.trim(),
        startLine,
        endLine,
        index,
      };
    });
}

function splitParagraphs(text: string): { text: string; lineOffset: number }[] {
  // Track line numbers accurately by iterating through the original text
  const result: { text: string; lineOffset: number }[] = [];
  // Split preserving separators to track cumulative line offsets correctly
  const parts = text.split(/(\n{2,})/);
  let lineOffset = 0;

  for (let i = 0; i < parts.length; i += 2) {
    const block = parts[i];
    const separator = parts[i + 1]; // the \n{2,} between blocks
    const trimmed = block.trim();
    if (trimmed) {
      result.push({ text: trimmed, lineOffset });
    }
    lineOffset += countLines(block);
    if (separator) {
      lineOffset += separator.split("\n").length - 1;
    }
  }

  return result;
}

function splitLongParagraph(text: string, maxChars: number): string[] {
  // Try splitting by sentences first (CJK-aware)
  const sentences = splitSentences(text);
  return mergeByMaxChars(sentences, maxChars);
}

/**
 * Split text into sentences. Handles CJK sentence-ending punctuation
 * (。！？) in addition to Western punctuation (.!?).
 */
function splitSentences(text: string): string[] {
  // Split at sentence-ending punctuation followed by whitespace or end
  const parts = text.split(/(?<=[。！？.!?])\s*/);
  return parts.filter((p) => p.trim().length > 0);
}

function mergeByMaxChars(parts: string[], maxChars: number): string[] {
  const result: string[] = [];
  let current = "";

  for (const part of parts) {
    if (current.length + part.length + 1 > maxChars && current.length > 0) {
      result.push(current.trim());
      current = "";
    }
    current += (current ? " " : "") + part;
  }

  if (current.trim()) {
    // If single part still exceeds maxChars, split by commas
    if (current.length > maxChars) {
      result.push(...splitByCommas(current, maxChars));
    } else {
      result.push(current.trim());
    }
  }

  return result;
}

function splitByCommas(text: string, maxChars: number): string[] {
  const parts = text.split(/(?<=[，,；;、])\s*/);
  // If no commas found (single element), hard-split by maxChars to avoid infinite recursion
  if (parts.length <= 1) {
    return hardSplit(text, maxChars);
  }
  return mergeByMaxChars(parts, maxChars);
}

/** Hard-split text into fixed-size chunks as a last resort. */
function hardSplit(text: string, maxChars: number): string[] {
  const result: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    result.push(text.slice(offset, offset + maxChars));
    offset += maxChars;
  }
  return result;
}

function countLines(text: string): number {
  return text.split("\n").length;
}
