import React, { useState } from 'react';
import { MessageSquare, PlusCircle, Compass, User } from 'lucide-react';

interface NavItemProps {
  icon: React.ElementType;
  label?: string;
  isActive?: boolean;
  onClick?: () => void;
  indicatorPosition: number;
  position: number;
}

const NavItem: React.FC<NavItemProps> = ({
  icon: Icon,
  isActive = false,
  onClick,
  indicatorPosition,
  position
}) => {
  const distance = Math.abs(indicatorPosition - position);
  const spotlightOpacity = isActive ? 1 : Math.max(0, 1 - distance * 0.6);

  return (
    <button
      className="relative flex items-center justify-center w-14 h-12 mx-1 transition-all duration-400 focus:outline-none"
      onClick={onClick}
    >
      <div
        className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-12 h-24 bg-gradient-to-b from-white/40 to-transparent blur-lg rounded-full pointer-events-none transition-opacity duration-400"
        style={{
          opacity: spotlightOpacity,
          transitionDelay: isActive ? '0.1s' : '0s',
        }}
      />
      <Icon
        className={`w-6 h-6 transition-colors duration-200 ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
          }`}
        strokeWidth={isActive ? 2.5 : 2}
      />
    </button>
  );
};

export interface SpotlightDockItem {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}

interface ComponentProps {
  items?: SpotlightDockItem[];
  activeIndex?: number;
  onSelectTab?: (index: number) => void;
}

export const Component: React.FC<ComponentProps> = ({
  items,
  activeIndex: externalActiveIndex,
  onSelectTab,
}) => {
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);

  const activeIndex = externalActiveIndex !== undefined ? externalActiveIndex : internalActiveIndex;

  const defaultNavItems: SpotlightDockItem[] = [
    { icon: MessageSquare, label: 'Chat' },
    { icon: PlusCircle, label: 'Create' },
    { icon: Compass, label: 'Explore' },
    { icon: User, label: 'Profile' },
  ];

  const navItems = items || defaultNavItems;

  const handleSelect = (index: number) => {
    if (onSelectTab) {
      onSelectTab(index);
    } else {
      setInternalActiveIndex(index);
    }
  };

  return (
    <div className="container">
      <nav className="relative flex items-center px-4 py-2 bg-black/90 backdrop-blur-md rounded-full shadow-2xl border border-white/15">
        <div
          className="absolute top-0 h-[2px] bg-white transition-all duration-400 ease-in-out shadow-[0_0_8px_#fff]"
          style={{
            left: `${activeIndex * 64 + 20}px`,
            width: '48px',
            transform: 'translateY(-1px)',
          }}
        />
        {navItems.map((item, index) => (
          <NavItem
            key={item.label || index}
            icon={item.icon}
            label={item.label}
            isActive={activeIndex === index}
            onClick={() => handleSelect(index)}
            indicatorPosition={activeIndex}
            position={index}
          />
        ))}
      </nav>
      <style>{`
        html, body, :root {
          margin: 0;
          padding: 0;
          width: 100%;
          height: 100%;
          overflow: hidden;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }

        .container {
          width: 100vw;
          height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: rgb(15 15 20);
        }
      `}</style>
    </div>
  );
};
