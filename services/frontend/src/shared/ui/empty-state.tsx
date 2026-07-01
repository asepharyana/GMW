import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}

const fadeSlideUp = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
};

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <motion.div
      variants={fadeSlideUp}
      initial="initial"
      animate="animate"
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'py-8 gap-3' : 'py-16 gap-4',
        className,
      )}
    >
      <div className={cn('rounded-full bg-primary-soft p-3', compact ? 'p-2' : 'p-4')}>
        <Icon className={cn('text-primary', compact ? 'h-5 w-5' : 'h-8 w-8')} />
      </div>
      {title && <h3 className="text-lg font-semibold text-[#1a1a1a]">{title}</h3>}
      {description && (
        <p className="text-sm text-[#666666] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}
