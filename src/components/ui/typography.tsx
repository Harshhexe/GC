import * as React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from '../../lib/utils';

const TextClassContext = React.createContext<string | undefined>(undefined);

const Text = React.forwardRef<React.ElementRef<typeof RNText>, RNTextProps>(
  ({ className, style, ...props }, ref) => {
    const textClass = React.useContext(TextClassContext);
    return (
      <RNText
        className={cn('text-base text-foreground web:select-text', textClass, className)}
        ref={ref}
        style={style}
        {...props}
      />
    );
  }
);
Text.displayName = 'Text';

export { Text, TextClassContext };
