import React, { useEffect, useState, useRef } from 'react';
import { Text, TextStyle, StyleSheet } from 'react-native';

interface DecryptedTextProps {
  text: string;
  style?: TextStyle;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
}

const GLYPHS = '01#$*+~XYZ987654321%@&?!';

/**
 * DecryptedText inspired by React Bits Decrypted Text.
 * Scrambles and decrypts characters one by one with a futuristic AI intelligence vibe.
 */
export function DecryptedText({
  text,
  style,
  speed = 40,
  sequential = true,
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState(text);
  const animatingRef = useRef(false);

  useEffect(() => {
    let iteration = 0;
    const target = text;
    const len = target.length;
    animatingRef.current = true;

    const interval = setInterval(() => {
      setDisplayText(() => {
        return target
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (sequential && index < iteration) {
              return target[index];
            }
            if (!sequential && Math.random() > 0.4) {
              return target[index];
            }
            return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
          })
          .join('');
      });

      iteration += 1 / 1.5;

      if (iteration >= len) {
        clearInterval(interval);
        setDisplayText(target);
        animatingRef.current = false;
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, sequential]);

  return <Text style={[styles.text, style]}>{displayText}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontVariant: ['tabular-nums'],
  },
});
