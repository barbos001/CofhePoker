import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const TypewriterText = ({ text, color = '#FFF', speed = 0.025 }: { text: string, color?: string, speed?: number }) => {
  const [displayedText, setDisplayedText] = useState('');

  useEffect(() => {
    setDisplayedText('');
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedText(text.substring(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, speed * 1000);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className="font-satoshi text-sm" style={{ color }}>
      {displayedText}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ repeat: Infinity, duration: 0.8 }}
        className="inline-block w-1.5 h-3.5 ml-0.5 align-middle bg-current"
      />
    </span>
  );
};

export const NumberScramble = ({ value, className }: { value: number, className?: string }) => {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let startTime: number;
    const duration = 400; // 0.4s scramble

    const animate = (time: number) => {
      if (!startTime) startTime = time;
      const progress = time - startTime;

      if (progress < duration) {
        setDisplay(Math.floor(Math.random() * Math.max(value * 2, 1000)));
        requestAnimationFrame(animate);
      } else {
        setDisplay(value);
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return <span className={className}>{display.toLocaleString()}</span>;
};

export const CountUp = ({ to, className }: { to: number, className?: string }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const duration = 1500;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      setCount(Math.floor(easeProgress * to));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [to]);

  return <span className={className}>{count.toLocaleString()}</span>;
};
