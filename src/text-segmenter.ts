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

interface Paragraph {
  text: string;
  startLine: number;
  endLine: number;
  paragraphIndex: number;
}

interface SegmentDraft {
  text: string;
  startLine: number;
  endLine: number;
  paragraphIndex: number;
}

/**
 * Split normalized text into segments suitable for TTS synthesis.
 * Strategy: paragraphs → sentences (CJK-aware) → commas, then merge short
 * chunks so TTS gets fewer tiny requests.
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
  const drafts: SegmentDraft[] = [];

  for (const para of paragraphs) {
    const subSegments = splitLongParagraph(para.text, safeMaxChars);
    for (const sub of subSegments) {
      drafts.push({
        text: sub,
        startLine: para.startLine,
        endLine: para.endLine,
        paragraphIndex: para.paragraphIndex,
      });
    }
  }

  return mergeShortSegments(drafts, safeMaxChars)
    .filter((s) => s.text.trim().length > 0)
    .map((s, index) => {
      return {
        text: s.text.trim(),
        startLine: s.startLine + lineOffset,
        endLine: s.endLine + lineOffset,
        index,
      };
    });
}

function splitParagraphs(text: string): Paragraph[] {
  const result: Paragraph[] = [];
  const lines = text.split("\n");
  let block: string[] = [];
  let startLine: number | null = null;

  const flush = (endLine: number) => {
    if (startLine === null || block.length === 0) return;
    result.push({
      text: block.join("\n").trim(),
      startLine,
      endLine,
      paragraphIndex: result.length,
    });
    block = [];
    startLine = null;
  };

  lines.forEach((line, index) => {
    if (line.trim()) {
      if (startLine === null) startLine = index;
      block.push(line.trim());
      return;
    }

    flush(index - 1);
  });

  flush(lines.length - 1);
  return result;
}

function splitLongParagraph(text: string, maxChars: number): string[] {
  const sentences = splitSentences(text);
  const pieces: string[] = [];
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      pieces.push(...splitByCommas(sentence, maxChars));
    } else {
      pieces.push(sentence);
    }
  }
  return mergeByMaxChars(pieces, maxChars);
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
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.length > maxChars) {
      if (current) {
        result.push(current.trim());
        current = "";
      }
      result.push(...hardSplit(trimmed, maxChars));
      continue;
    }

    const candidate = current ? `${current} ${trimmed}` : trimmed;
    if (candidate.length > maxChars && current.length > 0) {
      result.push(current.trim());
      current = trimmed;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function splitByCommas(text: string, maxChars: number): string[] {
  const parts = text
    .split(/(?<=[，,；;、])\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  // If no commas found (single element), hard-split by maxChars to avoid infinite recursion
  if (parts.length <= 1) {
    return hardSplit(text, maxChars);
  }
  const result: string[] = [];
  for (const part of parts) {
    if (part.length > maxChars) {
      result.push(...hardSplit(part, maxChars));
    } else {
      result.push(part);
    }
  }
  return result;
}

/** Hard-split text into balanced chunks as a last resort. */
function hardSplit(text: string, maxChars: number): string[] {
  const result: string[] = [];
  const groupCount = Math.ceil(text.length / maxChars);
  const targetLength = Math.ceil(text.length / groupCount);
  let offset = 0;

  while (offset < text.length) {
    result.push(text.slice(offset, offset + targetLength));
    offset += targetLength;
  }

  return result;
}

function mergeShortSegments(segments: SegmentDraft[], maxChars: number): SegmentDraft[] {
  if (segments.length <= 1) return segments;

  const rangeLengths = buildRangeLengths(segments);
  const totalLength = rangeLengths[0][segments.length];
  if (totalLength <= maxChars) {
    return [combineRange(segments, 0, segments.length)];
  }

  const minGroupCount = Math.ceil(totalLength / maxChars);
  for (let groupCount = minGroupCount; groupCount <= segments.length; groupCount++) {
    const partition = findBalancedPartition(
      rangeLengths,
      groupCount,
      totalLength / groupCount,
      maxChars
    );

    if (partition) {
      return partition.map(([start, end]) => combineRange(segments, start, end));
    }
  }

  return segments;
}

function buildRangeLengths(segments: SegmentDraft[]): number[][] {
  const lengths: number[][] = [];

  for (let start = 0; start < segments.length; start++) {
    lengths[start] = [];
    let length = 0;

    for (let end = start + 1; end <= segments.length; end++) {
      if (end > start + 1) {
        length += getSeparator(segments[end - 2], segments[end - 1]).length;
      }
      length += segments[end - 1].text.length;
      lengths[start][end] = length;
    }
  }

  return lengths;
}

function findBalancedPartition(
  rangeLengths: number[][],
  groupCount: number,
  idealLength: number,
  maxChars: number
): [number, number][] | null {
  const count = rangeLengths.length;
  const costs: number[][] = [];
  const prevs: number[][] = [];

  for (let group = 0; group <= groupCount; group++) {
    costs[group] = [];
    prevs[group] = [];
    for (let end = 0; end <= count; end++) {
      costs[group][end] = Number.POSITIVE_INFINITY;
      prevs[group][end] = -1;
    }
  }

  costs[0][0] = 0;

  for (let group = 1; group <= groupCount; group++) {
    for (let end = group; end <= count; end++) {
      for (let start = end - 1; start >= group - 1; start--) {
        const length = rangeLengths[start][end];
        if (length > maxChars) break;

        const previousCost = costs[group - 1][start];
        if (!Number.isFinite(previousCost)) continue;

        const cost = previousCost + Math.pow(length - idealLength, 2);
        if (cost < costs[group][end]) {
          costs[group][end] = cost;
          prevs[group][end] = start;
        }
      }
    }
  }

  if (!Number.isFinite(costs[groupCount][count])) return null;

  const partition: [number, number][] = [];
  let end = count;
  for (let group = groupCount; group > 0; group--) {
    const start = prevs[group][end];
    if (start < 0) return null;
    partition.unshift([start, end]);
    end = start;
  }

  return partition;
}

function combineRange(segments: SegmentDraft[], start: number, end: number): SegmentDraft {
  let text = segments[start].text;

  for (let i = start + 1; i < end; i++) {
    text += `${getSeparator(segments[i - 1], segments[i])}${segments[i].text}`;
  }

  return {
    text,
    startLine: segments[start].startLine,
    endLine: segments[end - 1].endLine,
    paragraphIndex: segments[end - 1].paragraphIndex,
  };
}

function getSeparator(left: SegmentDraft, right: SegmentDraft): string {
  return left.paragraphIndex === right.paragraphIndex ? " " : "\n";
}
