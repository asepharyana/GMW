import { motion } from 'framer-motion';
import { LayoutDashboard, MessageSquare, Radio } from 'lucide-react';
import type { DashboardTab } from '../entities/ui/types.js';
import { cn } from '../shared/lib/utils';

const tabs: { id: DashboardTab; label: string; icon: typeof MessageSquare }[] = [
  { id: 'messages', label: 'Pesan & Moderasi', icon: MessageSquare },
  { id: 'live', label: 'Voice & Media', icon: Radio },
  { id: 'dashboard', label: 'Dashboard Guild', icon: LayoutDashboard },
];

interface TabStripProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  className?: string;
}

export function TabStrip({ activeTab, onTabChange, className }: TabStripProps) {
  return (
    <nav className={cn('sticky top-14 z-30 border-b border-[#e0e0e0] bg-white/80 backdrop-blur-sm overflow-x-auto scrollbar-none', className)}>
      <div className="mx-auto flex max-w-[1280px] gap-1 px-4 md:px-6 lg:px-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                'relative flex items-center gap-2 px-4 py-3 whitespace-nowrap text-sm font-semibold transition-colors duration-150',
                isActive ? 'text-[#23a1eb]' : 'text-[#666666] hover:text-[#1a1a1a]',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#23a1eb] rounded-full"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
