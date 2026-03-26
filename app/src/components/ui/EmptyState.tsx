interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: string;
}

export default function EmptyState({ title, description, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <span className="text-4xl mb-4" role="img" aria-hidden="true">
          {icon}
        </span>
      )}
      <h3 className="text-lg font-semibold text-gray-700 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-sm">{description}</p>
      )}
    </div>
  );
}
