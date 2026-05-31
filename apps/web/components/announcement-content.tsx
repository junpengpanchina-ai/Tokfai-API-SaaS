export function AnnouncementContent({ content }: { content: string }) {
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap break-words text-foreground">
      {content}
    </div>
  );
}
