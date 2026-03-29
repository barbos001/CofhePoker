import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CONTRACT_ADDRESS } from '@/config/contract';

const ETHERSCAN = 'https://sepolia.etherscan.io';

const FAQ = ({ q, a }: { q: string; a: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-4 flex items-center justify-between text-left"
      >
        <span className="font-satoshi text-sm font-medium text-white pr-4">{q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          className="text-xs shrink-0"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ▾
        </motion.span>
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
        className="overflow-hidden"
      >
        <p className="pb-4 font-satoshi text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--color-text-secondary)' }}>
          {a}
        </p>
      </motion.div>
    </div>
  );
};

const Section = ({
  title,
  children,
  delay = 0,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  delay?: number;
  defaultOpen?: boolean;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45 }}
      className="mb-4"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 group"
      >
        <h2 className="font-clash text-xl uppercase tracking-tight group-hover:text-white transition-colors">{title}</h2>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          className="text-sm"
          style={{ color: 'var(--color-text-muted)' }}
        >
          ▾
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="pb-6">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
};

const TRow = ({ cells, header, highlight }: { cells: string[]; header?: boolean; highlight?: boolean }) => (
  <div
    className={`flex items-center gap-2 px-4 py-2.5 ${header ? 'font-mono text-[10px] tracking-widest uppercase' : 'font-satoshi text-sm'}`}
    style={{
      background: header ? 'rgba(255,255,255,0.04)' : highlight ? 'rgba(255,224,61,0.03)' : 'transparent',
      color: header ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
    }}
  >
    {cells.map((cell, i) => (
      <span key={i} className={`flex-1 ${i === 0 && !header ? 'text-white font-medium' : ''}`}>
        {cell}
      </span>
    ))}
  </div>
);

const Code = ({ children }: { children: string }) => (
  <pre
    className="font-mono text-[11px] leading-relaxed p-4 rounded-xl overflow-x-auto"
    style={{ background: 'rgba(0,0,0,0.4)', color: 'var(--color-fhe)', border: '1px solid rgba(179,102,255,0.1)' }}
  >
    {children}
  </pre>
);

export const HelpTab = () => {
  const deployed = CONTRACT_ADDRESS !== '0x0000000000000000000000000000000000000000';

  return (
    <div className="w-full max-w-[780px] mx-auto py-10 px-4 min-h-[calc(100vh-112px)]">
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-clash text-[48px] uppercase tracking-tight mb-2"
      >
        POKER GUIDE
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="font-satoshi text-sm mb-8"
        style={{ color: 'var(--color-text-muted)' }}
      >
        Cofhe 3-Card Poker + Texas Hold'em
      </motion.p>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* COFHE 3-CARD POKER (OUR GAME)                               */}
      {/* ══════════════════════════════════════════════════════════════ */}

      <div
        className="px-5 py-4 rounded-2xl mb-6"
        style={{ background: 'rgba(179,102,255,0.04)', border: '1px solid rgba(179,102,255,0.12)' }}
      >
        <div className="font-mono text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--color-fhe)' }}>
          OUR GAME
        </div>
        <div className="font-clash text-lg uppercase tracking-tight text-white mb-1">Cofhe 3-Card Poker</div>
        <div className="font-satoshi text-xs" style={{ color: 'var(--color-text-muted)' }}>
          FHE-encrypted on-chain poker. 3 cards, no community cards, instant showdown.
        </div>
      </div>

      {/* ── How to Play (Our Game) ── */}
      <Section title="How to Play" delay={0.05} defaultOpen>
        <div
          className="rounded-2xl p-5 mb-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          {[
            { step: '01', text: 'Connect MetaMask on Sepolia testnet' },
            { step: '02', text: 'Toggle Pair Plus side bet if desired (+10 chips, pays up to 40:1)' },
            { step: '03', text: 'Click START — pays 10 chip Ante (both you and dealer)' },
            { step: '04', text: 'FHE generates 6 encrypted cards. Cards dealt alternating: you get #1, #3, #5' },
            { step: '05', text: 'Sign permit to decrypt your 3 cards (only you can see them)' },
            { step: '06', text: 'Choose PLAY (bet 10 more) or FOLD (lose Ante only)' },
            { step: '07', text: 'Dealer must qualify with Queen-high or better' },
            { step: '08', text: 'If dealer doesn\'t qualify → you win Ante 1:1, Play bet returned' },
            { step: '09', text: 'If both qualify → showdown! Higher hand wins. Ante Bonus pays for strong hands' },
          ].map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-4 py-3"
              style={{ borderBottom: i < 8 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
            >
              <span className="font-clash text-2xl shrink-0 w-8" style={{ color: 'var(--color-text-dark)' }}>{s.step}</span>
              <span className="font-satoshi text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{s.text}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── 3-Card Hand Rankings ── */}
      <Section title="3-Card Rankings" delay={0.08}>
        <p className="font-satoshi text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
          In 3-card poker, Straight beats Flush (harder to hit with 3 cards). Mini Royal = A-K-Q suited.
        </p>
        <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
          <TRow cells={['Hand', 'Example', 'Description']} header />
          {[
            ['Mini Royal', 'A♠ K♠ Q♠', 'A-K-Q of one suit (best hand)'],
            ['Straight Flush', '7♥ 8♥ 9♥', 'Three consecutive, same suit'],
            ['Three of a Kind', 'K♦ K♣ K♥', 'Three same rank (Trips)'],
            ['Straight', '9♦ 10♣ J♥', 'Three consecutive, any suit'],
            ['Flush', '2♥ 7♥ Q♥', 'Three same suit, not consecutive'],
            ['Pair', 'A♠ A♦ 5♣', 'Two same rank + kicker'],
            ['High Card', '3♦ 8♣ K♠', 'Nothing; highest card wins'],
          ].map((row, i) => (
            <TRow key={i} cells={row} highlight={i === 0} />
          ))}
        </div>
      </Section>

      {/* ── Payouts ── */}
      <Section title="Payouts & Bets" delay={0.1}>
        <div className="space-y-5">
          {/* Ante + Play */}
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--color-primary)' }}>
              Ante & Play Payouts
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
              <TRow cells={['Result', 'Ante', 'Play']} header />
              <TRow cells={['You win', '+1:1', '+1:1']} />
              <TRow cells={['Push (tie)', 'Returned', 'Returned']} />
              <TRow cells={['You lose', 'Lost', 'Lost']} />
              <TRow cells={['Dealer not qualified', '+1:1', 'Returned (push)']} />
              <TRow cells={['You fold', 'Lost', 'N/A']} />
            </div>
          </div>

          {/* Ante Bonus */}
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--color-success)' }}>
              Ante Bonus (paid regardless of dealer hand)
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
              <TRow cells={['Hand', 'Bonus']} header />
              <TRow cells={['Straight', '1:1 (1x Ante)']} />
              <TRow cells={['Three of a Kind', '4:1 (4x Ante)']} />
              <TRow cells={['Straight Flush', '5:1 (5x Ante)']} />
              <TRow cells={['Mini Royal', '5:1 (5x Ante)']} highlight />
            </div>
          </div>

          {/* Pair Plus */}
          <div>
            <div className="font-mono text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--color-fhe)' }}>
              Pair Plus (independent side bet — pays even on fold!)
            </div>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
              <TRow cells={['Hand', 'Payout']} header />
              <TRow cells={['Pair', '1:1']} />
              <TRow cells={['Flush', '4:1']} />
              <TRow cells={['Straight', '6:1']} />
              <TRow cells={['Three of a Kind', '30:1']} />
              <TRow cells={['Straight Flush / Mini Royal', '40:1']} highlight />
            </div>
            <p className="font-satoshi text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
              Pair Plus is optional. If you have no pair, you lose the side bet regardless of game outcome.
            </p>
          </div>

          {/* Dealer Qualification */}
          <div
            className="p-4 rounded-xl"
            style={{ background: 'rgba(255,224,61,0.04)', border: '1px solid rgba(255,224,61,0.12)' }}
          >
            <div className="font-mono text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--color-primary)' }}>
              Dealer Qualification
            </div>
            <p className="font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              Dealer must have <strong className="text-white">Queen-high or better</strong> to qualify.
              If the dealer doesn't qualify, you automatically win 1:1 on Ante and your Play bet is returned (push).
              Ante Bonus and Pair Plus still pay normally.
            </p>
          </div>
        </div>
      </Section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TEXAS HOLD'EM GUIDE                                          */}
      {/* ══════════════════════════════════════════════════════════════ */}

      <div
        className="h-px my-8"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="font-mono text-[10px] tracking-widest uppercase mb-6"
        style={{ color: 'var(--color-text-muted)' }}
      >
        GENERAL POKER KNOWLEDGE
      </motion.div>

      {/* ── Deck ── */}
      <Section title="1. The Deck" delay={0.12}>
        <div className="space-y-3">
          <p className="font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            52 cards = 13 ranks x 4 suits. Suit only matters for flushes.
          </p>
          <Code>{`Ranks: 2  3  4  5  6  7  8  9  10  J   Q   K   A
       2  3  4  5  6  7  8  9  10  11  12  13  14

Suits: ♠ Spades  ♥ Hearts  ♦ Diamonds  ♣ Clubs`}</Code>
        </div>
      </Section>

      {/* ── Poker Types ── */}
      <Section title="2. Types of Poker" delay={0.14}>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
          <TRow cells={['Type', 'Hole Cards', 'Community']} header />
          <TRow cells={["Texas Hold'em", '2', '5 (3+1+1)']} highlight />
          <TRow cells={['Omaha', '4 (use exactly 2)', '5']} />
          <TRow cells={['5 Card Draw', '5', 'None']} />
          <TRow cells={['3-Card Poker', '3', 'None']} />
        </div>
      </Section>

      {/* ── Table Roles ── */}
      <Section title="3. Table Roles" delay={0.16}>
        <div className="space-y-3">
          <Code>{`BTN  = Dealer (Button) — deals, acts last post-flop
SB   = Small Blind    — posts half the minimum bet
BB   = Big Blind      — posts the full minimum bet
UTG  = Under the Gun  — first to act pre-flop`}</Code>
          <p className="font-satoshi text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Roles rotate clockwise after every hand.
          </p>
        </div>
      </Section>

      {/* ── Hand Structure ── */}
      <Section title="4. Hand Structure (Hold'em)" delay={0.18}>
        <div className="space-y-4">
          {[
            {
              phase: 'PREFLOP',
              color: 'var(--color-primary)',
              desc: 'SB & BB post blinds. Each player gets 2 hole cards. Betting starts from UTG.',
            },
            {
              phase: 'FLOP',
              color: 'var(--color-fhe)',
              desc: 'Burn 1 card, reveal 3 community cards. Betting starts from SB.',
            },
            {
              phase: 'TURN',
              color: 'var(--color-success)',
              desc: 'Burn 1 card, reveal 1 more community card. Betting round.',
            },
            {
              phase: 'RIVER',
              color: 'var(--color-danger)',
              desc: 'Burn 1 card, reveal the last community card. Final betting round.',
            },
            {
              phase: 'SHOWDOWN',
              color: '#FFF',
              desc: 'Remaining players show hands. Best 5 of 7 cards wins the pot.',
            },
          ].map((p, i) => (
            <div key={i} className="flex items-start gap-4">
              <div
                className="font-mono text-[10px] tracking-widest uppercase shrink-0 w-20 py-1.5 rounded-full text-center"
                style={{ background: `${p.color}15`, color: p.color, border: `1px solid ${p.color}30` }}
              >
                {p.phase}
              </div>
              <span className="font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>{p.desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Actions ── */}
      <Section title="5. Betting Actions" delay={0.2}>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
          <TRow cells={['Action', 'When', 'Effect']} header />
          <TRow cells={['FOLD', 'Any time', 'Discard cards, lose all bets']} />
          <TRow cells={['CHECK', 'No bet yet', 'Pass without betting']} />
          <TRow cells={['CALL', 'After bet', 'Match current bet']} />
          <TRow cells={['BET', 'No bet yet', 'First bet in round']} />
          <TRow cells={['RAISE', 'After bet', 'Increase the current bet']} />
          <TRow cells={['ALL-IN', 'Any time', 'Bet all remaining chips']} />
        </div>
        <p className="font-satoshi text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
          Minimum raise = size of previous raise or BB (whichever is larger).
        </p>
      </Section>

      {/* ── 5-Card Hand Rankings ── */}
      <Section title="6. Hand Rankings (5-Card)" delay={0.22}>
        <p className="font-satoshi text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Standard poker hand rankings. In 5-card poker, Flush beats Straight (opposite of 3-card).
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
          <TRow cells={['#', 'Hand', 'Example', 'Probability']} header />
          {[
            ['1', 'Royal Flush', 'A K Q J 10 suited', '0.00015%'],
            ['2', 'Straight Flush', '9 8 7 6 5 suited', '0.0014%'],
            ['3', 'Four of a Kind', 'K K K K x', '0.024%'],
            ['4', 'Full House', 'J J J 7 7', '0.144%'],
            ['5', 'Flush', '5 cards same suit', '0.197%'],
            ['6', 'Straight', '5 consecutive', '0.393%'],
            ['7', 'Three of a Kind', '8 8 8 x x', '2.113%'],
            ['8', 'Two Pair', 'A A 5 5 x', '4.754%'],
            ['9', 'One Pair', 'Q Q x x x', '42.26%'],
            ['10', 'High Card', 'Nothing', '50.12%'],
          ].map((row, i) => (
            <TRow key={i} cells={row} highlight={i === 0} />
          ))}
        </div>
        <div
          className="mt-3 p-3 rounded-xl font-satoshi text-xs"
          style={{ background: 'rgba(255,224,61,0.04)', border: '1px solid rgba(255,224,61,0.1)', color: 'var(--color-text-secondary)' }}
        >
          <strong className="text-white">Ace in straights:</strong> A-K-Q-J-10 = highest straight (Royal if suited).
          A-2-3-4-5 = lowest straight (Ace plays as 1, high card = 5).
        </div>
      </Section>

      {/* ── Tiebreakers ── */}
      <Section title="7. Tiebreakers" delay={0.24}>
        <Code>{`Royal Flush     → always tie (suit doesn't matter)
Straight Flush  → higher top card wins
Four of a Kind  → higher quad rank → kicker
Full House      → higher trips rank → higher pair
Flush           → compare cards top-down (1st, 2nd, 3rd, 4th, 5th)
Straight        → higher top card wins
Three of a Kind → higher trips → kicker1 → kicker2
Two Pair        → higher pair → lower pair → kicker
One Pair        → higher pair → kicker1 → kicker2 → kicker3
High Card       → compare all 5 cards top-down

If all 5 cards identical → tie, split the pot.`}</Code>
      </Section>

      {/* ── Scoring ── */}
      <Section title="8. Scoring System (for code)" delay={0.26}>
        <Code>{`Royal Flush    = 9,000,000
Straight Flush = 8,000,000 + highCard
Four of a Kind = 7,000,000 + rank × 1000 + kicker
Full House     = 6,000,000 + tripRank × 100 + pairRank
Flush          = 5,000,000 + c1×10⁸ + c2×10⁶ + c3×10⁴ + c4×100 + c5
Straight       = 4,000,000 + highCard
Three of a Kind= 3,000,000 + rank×10000 + k1×100 + k2
Two Pair       = 2,000,000 + hiPair×10000 + loPair×100 + kicker
One Pair       = 1,000,000 + pair×10000 + k1×100 + k2×10 + k3
High Card      = c1×10⁸ + c2×10⁶ + c3×10⁴ + c4×100 + c5`}</Code>
      </Section>

      {/* ── Showdown ── */}
      <Section title="9. Showdown Rules" delay={0.28}>
        <div
          className="rounded-xl p-4 space-y-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          {[
            'Last aggressor (bet/raise) shows first',
            'If all checked → first left of BTN shows',
            'Losing player may muck (not show)',
            'Player can use 0, 1, or 2 hole cards',
            'If 5 community cards are best → "play the board"',
          ].map((rule, i) => (
            <div key={i} className="flex items-start gap-2 font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              <span className="w-1 h-1 rounded-full shrink-0 mt-2" style={{ background: 'var(--color-primary)' }} />
              {rule}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Side Pots ── */}
      <Section title="10. Side Pots" delay={0.3}>
        <p className="font-satoshi text-sm mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          When a player goes all-in with fewer chips than others, side pots are created.
        </p>
        <Code>{`Player A: 100 chips all-in
Player B: 300 chips
Player C: 300 chips

Main Pot:  100 × 3 = 300  (A can win this)
Side Pot:  200 × 2 = 400  (only B & C compete)

A can only win Main Pot, even with the best hand.`}</Code>
      </Section>

      {/* ── Full Deal Algorithm ── */}
      <Section title="11. Full Deal Algorithm" delay={0.32}>
        <Code>{`START
├── Collect blinds (SB + BB)
├── Deal 2 cards each (one at a time, twice around)
│
PREFLOP
├── Betting from UTG
├── Each: fold / call / raise
├── Ends when all bets equalized
│
FLOP
├── Burn 1 card
├── Reveal 3 community cards
├── Betting from SB
│
TURN
├── Burn 1 card
├── Reveal 1 card
├── Betting
│
RIVER
├── Burn 1 card
├── Reveal 1 card
├── Final betting
│
SHOWDOWN
├── Best 5-card hand from 7 available
├── C(7,5) = 21 possible combinations
├── Compare → winner takes pot
│
NEXT HAND
└── Rotate roles clockwise, repeat`}</Code>
      </Section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* FHE / TECHNICAL                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}

      <div
        className="h-px my-8"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(179,102,255,0.15), transparent)' }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="font-mono text-[10px] tracking-widest uppercase mb-6"
        style={{ color: 'var(--color-fhe)' }}
      >
        FHE ENCRYPTION & TECHNOLOGY
      </motion.div>

      {/* ── What is FHE? ── */}
      <Section title="What is FHE?" delay={0.36}>
        <div className="font-satoshi text-sm leading-relaxed space-y-4" style={{ color: 'var(--color-text-secondary)' }}>
          <p>
            <strong className="text-white">Fully Homomorphic Encryption (FHE)</strong> allows computation
            on encrypted data without ever decrypting it. The result is also encrypted.
          </p>
          <p>
            In Cofhe Poker, the smart contract shuffles, deals, and evaluates poker hands while card
            values remain completely hidden — even from the contract itself, validators, and your opponent.
          </p>
          <p>
            Only you can decrypt your own cards by signing an EIP-712 permit with your wallet. The
            opponent's cards stay encrypted unless revealed in a showdown.
          </p>
        </div>
      </Section>

      {/* ── Privacy Guarantees ── */}
      <Section title="Privacy Guarantees" delay={0.38}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            className="p-5 rounded-2xl"
            style={{ background: 'rgba(179,102,255,0.04)', border: '1px solid rgba(179,102,255,0.12)' }}
          >
            <div className="font-mono text-xs tracking-widest uppercase mb-3 flex items-center gap-2" style={{ color: 'var(--color-fhe)' }}>
              Hidden (FHE Encrypted)
            </div>
            <ul className="space-y-2 font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {['Card values', 'Card-to-player mapping', "Losing player's hand", 'Hand evaluation scores', 'Bot decision logic'].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-fhe)' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div
            className="p-5 rounded-2xl"
            style={{ background: 'rgba(0,232,108,0.03)', border: '1px solid rgba(0,232,108,0.1)' }}
          >
            <div className="font-mono text-xs tracking-widest uppercase mb-3 flex items-center gap-2" style={{ color: 'var(--color-success)' }}>
              Public (On-Chain)
            </div>
            <ul className="space-y-2 font-satoshi text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {['Bet amounts & balances', 'Player actions (fold/play)', 'Winner address', 'Pot size', 'Transaction hashes'].map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ background: 'var(--color-success)' }} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── FHE Operations ── */}
      <Section title="FHE Operations Used" delay={0.4}>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.05)' }}
        >
          {[
            ['FHE.randomEuint64()', 'Encrypted seed for card dealing'],
            ['FHE.rem(x, 52)', 'Map value to card 0–51'],
            ['FHE.div(card, 4)', 'Extract rank (2 through Ace)'],
            ['FHE.rem(card, 4)', 'Extract suit (♠ ♥ ♦ ♣)'],
            ['FHE.min / FHE.max', 'Sort for hand evaluation'],
            ['FHE.eq / FHE.or', 'Detect pairs, trips, flushes'],
            ['FHE.select(cond,a,b)', 'Encrypted conditional branching'],
            ['FHE.gt(s1, s2)', 'Compare hands — find winner'],
            ['FHE.decrypt(ebool)', 'Async decrypt via threshold network'],
            ['FHE.allow(addr)', 'Grant decryption to your wallet only'],
            ['FHE.allowPublic()', "Reveal winner's cards after showdown"],
          ].map(([code, desc], i) => (
            <div
              key={i}
              className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-5 py-3"
              style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}
            >
              <code className="font-mono text-xs min-w-[200px]" style={{ color: 'var(--color-fhe)' }}>{code}</code>
              <span className="font-satoshi text-xs" style={{ color: 'var(--color-text-muted)' }}>{desc}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section title="FAQ" delay={0.42}>
        <div
          className="rounded-2xl px-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <FAQ
            q="Is this real poker with real money?"
            a="No. Cofhe Poker uses virtual chips with no monetary value. It's a proof-of-concept for the Fhenix Buildathon 2026 demonstrating FHE-encrypted gaming on Ethereum."
          />
          <FAQ
            q="Can the dealer/bot cheat?"
            a="No. Cards and decision logic are handled entirely through FHE in the smart contract. The bot uses the Q-6-4 optimal strategy with small randomness — it cannot see your cards."
          />
          <FAQ
            q="Why does dealing take so long?"
            a="FHE operations are computationally intensive. Generating encrypted random cards, checking for duplicates, and evaluating hands all happen in ciphertext on-chain via the Fhenix CoFHE threshold network."
          />
          <FAQ
            q="What's the Pair Plus bet?"
            a="An optional 10-chip side bet that pays based only on your hand strength, regardless of the dealer's hand or game outcome. It pays even if you fold! Pair = 1:1, Flush = 4:1, Straight = 6:1, Trips = 30:1, Straight Flush = 40:1."
          />
          <FAQ
            q="What does 'Dealer doesn't qualify' mean?"
            a="The dealer needs Queen-high or better to qualify. If they don't, you win 1:1 on your Ante and your Play bet is returned (push). Ante Bonus and Pair Plus pay normally regardless."
          />
          <FAQ
            q="Why does Straight beat Flush in 3-card?"
            a="With only 3 cards, getting 3 consecutive ranks is statistically harder than getting 3 of the same suit. So in 3-card poker, the rankings are different from 5-card poker."
          />
          <FAQ
            q="What network do I need?"
            a="Ethereum Sepolia testnet. Get free Sepolia ETH from faucets like sepolia-faucet.pk910.de or Google Cloud's Sepolia faucet."
          />
          <FAQ
            q="Why do I need to sign a permit?"
            a="The EIP-712 permit proves to the CoFHE threshold network that you're authorized to decrypt your own cards. Without it, nobody — not even you — can see the card values."
          />
          <FAQ
            q="Can I see the losing hand?"
            a="No. When you lose, your opponent's cards remain encrypted forever. Only the winner's cards are revealed via FHE.allowPublic(). This mirrors real poker — you don't see mucked cards."
          />
        </div>
      </Section>

      {/* ── Verify ── */}
      <Section title="Verify & Links" delay={0.44}>
        <div
          className="rounded-2xl p-5"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="font-satoshi text-sm mb-4" style={{ color: 'var(--color-text-secondary)' }}>
            Every hand is a verifiable Ethereum transaction. All ciphertexts are public — but unreadable without a permit.
          </p>
          {deployed && (
            <div className="font-mono text-xs break-all mb-4 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--color-text-muted)' }}>
              {CONTRACT_ADDRESS}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {[
              deployed && { label: 'Etherscan', href: `${ETHERSCAN}/address/${CONTRACT_ADDRESS}` },
              { label: 'Fhenix Docs', href: 'https://cofhe-docs.fhenix.zone' },
              { label: 'CoFHE SDK', href: 'https://www.npmjs.com/package/@cofhe/sdk' },
              { label: 'Awesome Fhenix', href: 'https://github.com/FhenixProtocol/awesome-fhenix' },
            ]
              .filter(Boolean)
              .map(link => (
                <a
                  key={link!.label}
                  href={link!.href}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] tracking-widest px-3 py-1.5 rounded-full transition-colors hover:text-white"
                  style={{ color: 'var(--color-info)', border: '1px solid rgba(77,124,255,0.2)' }}
                >
                  {link!.label}
                </a>
              ))}
          </div>
        </div>
      </Section>
    </div>
  );
};
