interface PagePlaceholderProps {
  title: string;
}

export function PagePlaceholder({ title }: PagePlaceholderProps) {
  return (
    <div>
      <h1>{title}</h1>
      <p>This screen has not been built yet.</p>
    </div>
  );
}
