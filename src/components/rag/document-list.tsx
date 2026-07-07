"use client";

// ============================================================
// DocumentList — list uploaded docs with status, selection,
// and delete. Uses the shared Zustand store so all components
// see the same document list (no stale state after upload).
// ============================================================

import {
  FileText,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { useDocuments } from "@/hooks/use-rag";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import type { DocumentMeta } from "@/lib/types";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="secondary" className="gap-1 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
          <CheckCircle2 className="h-3 w-3" />
          Ready
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10">
          <Clock className="h-3 w-3" />
          <Loader2 className="h-3 w-3 animate-spin" />
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Error
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

interface DocumentListProps {
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function DocumentList({
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
}: DocumentListProps) {
  const { documents, loading, refresh, remove } = useDocuments();
  const { toast } = useToast();

  const readyDocs = documents.filter((d) => d.status === "ready");
  const allSelected =
    readyDocs.length > 0 && readyDocs.every((d) => selectedIds.includes(d.id));

  const handleDelete = async (id: string, filename: string) => {
    const result = await remove(id);
    if (result.ok) {
      toast({ title: "Document deleted", description: filename });
      if (selectedIds.includes(id)) onToggleSelect(id);
    } else {
      toast({
        title: "Delete failed",
        description: result.error,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Documents{" "}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({documents.length})
          </span>
        </h3>
        <div className="flex items-center gap-1">
          {readyDocs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={allSelected ? onClearSelection : onSelectAll}
              disabled={loading}
            >
              {allSelected ? "Clear" : "Select all"}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Selection hint banner */}
      {readyDocs.length > 0 && (
        <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          {selectedIds.length === 0 ? (
            <span>
              <strong className="text-foreground">Searching all docs.</strong>{" "}
              Select specific docs to scope your questions.
            </span>
          ) : (
            <span>
              <strong className="text-foreground">
                Scoped to {selectedIds.length} doc{selectedIds.length !== 1 ? "s" : ""}.
              </strong>{" "}
              Only those will be searched.
            </span>
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <FileText className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            No documents yet. Upload one to get started.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[450px]">
          <ul className="space-y-2 pr-2">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isSelected={selectedIds.includes(doc.id)}
                onToggle={() => onToggleSelect(doc.id)}
                onDelete={() => handleDelete(doc.id, doc.filename)}
              />
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  isSelected,
  onToggle,
  onDelete,
}: {
  doc: DocumentMeta;
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isReady = doc.status === "ready";
  return (
    <li
      className={`group flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors ${
        isSelected ? "border-primary bg-primary/5" : "border-border/60 hover:bg-muted/30"
      }`}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        disabled={!isReady}
        className="mt-0.5"
        aria-label={`Select ${doc.filename}`}
      />
      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-xs font-medium" title={doc.filename}>
          {doc.filename}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <StatusBadge status={doc.status} />
          <span>{formatSize(doc.fileSize)}</span>
          {doc.chunkCount > 0 && (
            <span>{doc.chunkCount} chunks</span>
          )}
        </div>
        {doc.status === "error" && doc.errorMsg && (
          <p className="text-[11px] text-destructive line-clamp-2" title={doc.errorMsg ?? ""}>
            {doc.errorMsg}
          </p>
        )}
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
            <span className="sr-only">Delete {doc.filename}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove &quot;{doc.filename}&quot; and all
              its embedded chunks. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
