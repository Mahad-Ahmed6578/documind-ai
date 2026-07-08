"use client";

// ============================================================
// DocumentUploader — drag-and-drop with MULTI-FILE support
// ============================================================
// Supports selecting multiple files via file picker or drag-and-drop.
// Files are processed one-at-a-time (sequential queue) to avoid
// data mixing. Each file shows its own progress status.
// ============================================================

import { useCallback, useState } from "react";
import { UploadCloud, Loader2, CheckCircle2, AlertCircle, FileText, X } from "lucide-react";
import { useDocuments } from "@/hooks/use-rag";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { UploadQueueItem } from "@/lib/documents-store";

const ACCEPTED = ".pdf,.docx,.txt,.md";

export function DocumentUploader() {
  const { upload, uploadMultiple, uploading, uploadQueue, clearQueue } = useDocuments();
  const { toast } = useToast();
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return;

      if (fileArray.length === 1) {
        // Single file: use original path with toast
        const result = await upload(fileArray[0]);
        if (result.ok) {
          toast({
            title: "Document ingested",
            description: `${fileArray[0].name} is ready to be queried.`,
          });
        } else {
          toast({
            title: "Upload failed",
            description: result.error ?? "Unknown error",
            variant: "destructive",
          });
        }
      } else {
        // Multi-file: use queue
        await uploadMultiple(fileArray);
        const doneCount = fileArray.length;
        toast({
          title: "Batch upload complete",
          description: `Processed ${doneCount} file(s).`,
        });
      }
    },
    [upload, uploadMultiple, toast]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles]
  );

  const hasQueue = uploadQueue.length > 0;

  return (
    <div className="space-y-3 p-4">
      <label
        htmlFor="doc-upload"
        className="block text-sm font-medium text-foreground"
      >
        Upload documents
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`relative flex flex-col items-center justify-center gap-2.5 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/30"
          }`}
      >
        <div className="rounded-full bg-primary/10 p-2.5">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <UploadCloud className="h-5 w-5 text-primary" />
          )}
        </div>

        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {uploading ? "Processing…" : "Drag & drop or click to upload"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            PDF, DOCX, TXT, MD · max 25 MB · multiple files supported
          </p>
        </div>

        <input
          id="doc-upload"
          type="file"
          accept={ACCEPTED}
          multiple
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={uploading}
          onChange={(e) => {
            const files = e.target.files;
            if (files && files.length > 0) handleFiles(files);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {/* Upload queue progress */}
      {hasQueue && (
        <div className="space-y-1.5 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Upload Queue</p>
            {!uploading && (
              <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={clearQueue}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {uploadQueue.map((item: UploadQueueItem, idx: number) => (
            <div key={idx} className="flex items-center gap-2 text-[11px]">
              {item.status === "uploading" && (
                <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
              )}
              {item.status === "done" && (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
              )}
              {item.status === "error" && (
                <AlertCircle className="h-3 w-3 text-destructive shrink-0" />
              )}
              {item.status === "pending" && (
                <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1">{item.file.name}</span>
              {item.error && (
                <span className="text-destructive truncate max-w-[120px]" title={item.error}>
                  {item.error}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {uploading && !hasQueue && (
        <div className="space-y-1.5">
          <Progress value={62} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            Parsing → chunking → embedding → persisting
          </p>
        </div>
      )}
    </div>
  );
}
