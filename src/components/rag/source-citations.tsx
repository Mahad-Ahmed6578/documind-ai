"use client";

// ============================================================
// SourceCitations — expandable source chunks under each answer
// ============================================================

import { ChevronDown, FileText, Quote } from "lucide-react";
import type { SourceChunk } from "@/lib/types";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";

function scoreColor(score: number): string {
  if (score >= 0.5) return "bg-emerald-500/10 text-emerald-700";
  if (score >= 0.2) return "bg-amber-500/10 text-amber-700";
  return "bg-rose-500/10 text-rose-700";
}

export function SourceCitations({ sources }: { sources: SourceChunk[] }) {
  if (sources.length === 0) {
    return null;
  }

  return (
    <Accordion type="multiple" className="mt-2">
      <AccordionItem value="sources" className="border-none">
        <AccordionTrigger className="py-1.5 text-xs hover:no-underline">
          <div className="flex items-center gap-1.5">
            <Quote className="h-3 w-3" />
            <span className="font-medium">
              {sources.length} source{sources.length !== 1 ? "s" : ""} cited
            </span>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <ul className="space-y-2">
            {sources.map((s, i) => (
              <li
                key={s.chunkId}
                className="rounded-md border border-border/40 bg-background/50 p-2.5 text-xs"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <FileText className="h-2.5 w-2.5" />
                    #{i + 1}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {s.filename}
                  </span>
                  <Badge
                    variant="secondary"
                    className={`text-[10px] ${scoreColor(s.score)}`}
                  >
                    {s.score.toFixed(3)}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    chunk {s.chunkIndex}
                  </span>
                </div>
                <p className="line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/70">
                  {s.content}
                </p>
              </li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
