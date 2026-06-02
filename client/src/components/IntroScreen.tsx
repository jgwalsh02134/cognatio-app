import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface IntroScreenProps {
  onComplete: () => void;
}

export default function IntroScreen({ onComplete }: IntroScreenProps) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleComplete();
    }, 5200);
    return () => clearTimeout(timer);
  }, []);

  const handleComplete = () => {
    setShow(false);
    setTimeout(() => onComplete(), 650);
  };

  const treeNodes = [
    { id: 1, x: 48, y: 42, delay: 0.6 },
    { id: 2, x: 52, y: 48, delay: 0.75 },
    { id: 3, x: 45, y: 51, delay: 0.9 },
    { id: 4, x: 55, y: 55, delay: 1.05 },
    { id: 5, x: 50, y: 38, delay: 1.2 },
    { id: 6, x: 42, y: 58, delay: 1.35 },
    { id: 7, x: 58, y: 61, delay: 1.5 },
    { id: 8, x: 47, y: 65, delay: 1.65 },
  ];

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black overflow-hidden"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative w-full max-w-[420px] aspect-[9/16] perspective-[1200px]">
          <motion.div
            className="relative w-full h-full"
            initial={{ rotateY: -88 }}
            animate={{ rotateY: 0 }}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
            style={{ transformStyle: "preserve-3d", transformOrigin: "left center" }}
          >
            <img
              src="/cognatio-intro.jpg"
              alt="Cognatio Intro"
              className="w-full h-full object-cover rounded-[4px] shadow-2xl"
            />
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-amber-400/60 via-yellow-300/40 to-transparent"
              initial={{ opacity: 0.2 }}
              animate={{ opacity: [0.2, 0.75, 0.55] }}
              transition={{ duration: 2.2, delay: 0.8 }}
            />
          </motion.div>

          {treeNodes.map((node) => (
            <motion.div
              key={node.id}
              className="absolute w-[7px] h-[7px] rounded-full bg-amber-300 shadow-[0_0_12px_4px_#fcd34d]"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.3, 1], opacity: [0, 1, 0.85] }}
              transition={{ duration: 0.8, delay: node.delay, ease: "backOut" }}
            />
          ))}

          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.55 }}>
            <motion.path d="M 48 42 Q 50 45 52 48" stroke="#fcd34d" strokeWidth="1" fill="none"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.1, duration: 0.6 }} />
            <motion.path d="M 52 48 Q 48 52 45 51" stroke="#fcd34d" strokeWidth="1" fill="none"
              initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 1.25, duration: 0.6 }} />
          </svg>
        </div>

        <button
          onClick={handleComplete}
          className="absolute bottom-9 right-8 z-30 px-6 py-2.5 text-sm tracking-widest text-white/60 hover:text-white border border-white/25 rounded-full hover:bg-white/10 active:scale-[0.985] transition-all"
        >
          SKIP INTRO
        </button>

        <motion.div
          className="absolute bottom-16 text-center z-20"
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 3.2, duration: 1.1 }}
        >
          <p className="text-[11px] tracking-[3.5px] text-white/50 font-light">WALSH • MALOY • DUGAN</p>
          <h1 className="text-[42px] font-light text-white tracking-[-1px] mt-1">Cognatio</h1>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
