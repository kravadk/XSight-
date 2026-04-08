import { Bell, Wallet, LogOut, X, Search, CheckCheck, AlertTriangle, Info, CheckCircle2, Sparkles } from 'lucide-react';
import { useWalletStore } from '../../store/walletStore';
import { toast } from '../../store/toastStore';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CipherScramble } from '../common/CipherScramble';
import { useNotificationsStore, type Notification } from '../../store/notificationsStore';
import { MagneticButton } from '../common/MagneticButton';

export function TopBar() {
  const { connected, short, address, network, totalUsd, setPortfolio } = useWalletStore();
  const setLoading = useWalletStore((s) => s.setLoading);
  const notifications = useNotificationsStore((s) => s.items);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const markRead = useNotificationsStore((s) => s.markRead);
  const clearNotifs = useNotificationsStore((s) => s.clear);
  const [modalOpen, setModalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleConnect = (kind: 'demo' | 'metamask' | 'okx' | 'walletconnect') => {
    if (kind === 'walletconnect') {
      toast.info('WalletConnect — coming soon');
      return;
    }
    if (kind === 'metamask' || kind === 'okx') {
      // OKX Wallet injects window.okxwallet AND window.ethereum (multi-provider).
      // Pick the OKX provider explicitly when the user chose OKX, otherwise the
      // generic ethereum provider.
      const w = window as unknown as {
        ethereum?: { request: (req: { method: string }) => Promise<string[]> };
        okxwallet?: { request: (req: { method: string }) => Promise<string[]> };
      };
      const provider = kind === 'okx' ? w.okxwallet ?? w.ethereum : w.ethereum;
      if (!provider) {
        toast.error(kind === 'okx' ? 'OKX Wallet not detected' : 'MetaMask not detected');
        return;
      }
      setLoading(true);
      void provider
        .request({ method: 'eth_requestAccounts' })
        .then((accounts) => {
          if (accounts && accounts[0]) {
            setPortfolio({
              address: accounts[0],
              network: 'X Layer Mainnet',
              tokens: useWalletStore.getState().tokens,
              totalUsd: useWalletStore.getState().totalUsd,
            });
            toast.success(`${kind === 'okx' ? 'OKX Wallet' : 'MetaMask'} connected`);
          }
          setModalOpen(false);
        })
        .catch(() => {
          toast.error('Connection rejected');
          setLoading(false);
        });
      return;
    }
    // Demo address (used by backend default)
    setPortfolio({
      address: address || '0x000000000000000000000000000000000000DEAD',
      network: 'X Layer Mainnet',
      tokens: useWalletStore.getState().tokens,
      totalUsd: useWalletStore.getState().totalUsd,
    });
    toast.success('Connected (demo)');
    setModalOpen(false);
  };

  const handleDisconnect = () => {
    useWalletStore.setState({ connected: false, short: '', address: '' });
    toast.info('Disconnected');
  };

  return (
    <header className="h-[60px] bg-[#0A0A0A] border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="hidden md:flex items-center gap-2 px-2 py-1 bg-[rgba(191,255,0,0.08)] rounded text-[#BFFF00] text-[10px] font-bold">
          <div className="w-1.5 h-1.5 rounded-full bg-[#BFFF00] animate-pulse" />
          {network}
        </div>
        {connected && (
          <div className="hidden md:flex items-center gap-2">
            <CipherScramble text={short} mono className="text-sm font-semibold text-[#F5F5F5]" />
            <span className="text-xs text-[#A3A3A3] font-mono">
              ${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-full bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.2)] text-[#A78BFA] text-[10px] font-bold uppercase tracking-wider">
          <span className="text-[#A78BFA]">✦</span> AI Active
        </div>
        <button
          onClick={() => {
            // synthesize Cmd+K keypress to trigger CommandPalette
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
          }}
          className="hidden md:flex items-center gap-2 h-10 px-3 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.06)] text-[#A3A3A3] text-xs transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search...</span>
          <kbd className="ml-2 text-[9px] font-mono bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded">⌘K</kbd>
        </button>
        <button
          onClick={() => setNotifOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[rgba(255,255,255,0.06)] text-[#A3A3A3] transition-colors relative"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <div className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-[#BFFF00] text-[#0A0A0A] text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 99 ? '99+' : unreadCount}
            </div>
          )}
        </button>

        {connected ? (
          <button
            onClick={handleDisconnect}
            className="h-10 px-4 flex items-center gap-2 rounded-xl border border-[rgba(255,255,255,0.15)] text-[#F5F5F5] text-sm font-medium hover:bg-[rgba(255,255,255,0.06)] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden md:inline">Disconnect</span>
          </button>
        ) : (
          <MagneticButton
            onClick={() => setModalOpen(true)}
            className="h-10 px-5 flex items-center gap-2 rounded-xl bg-[#BFFF00] text-[#0A0A0A] text-sm font-bold hover:bg-[#D4FF33] glow-lime transition-colors"
          >
            <Wallet className="w-4 h-4" />
            Connect
          </MagneticButton>
        )}
      </div>

      <AnimatePresence>
        {modalOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setModalOpen(false)}
              className="fixed inset-0 bg-black/60 z-[80]"
            />
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#151515] border border-[rgba(255,255,255,0.1)] rounded-2xl p-6 z-[90] w-[360px]"
            >
              <h3 className="text-lg font-bold text-[#F5F5F5] mb-1">Connect wallet</h3>
              <p className="text-[11px] text-[#A3A3A3] mb-4">X Layer Mainnet · Chain 196</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleConnect('okx')}
                  className="w-full h-12 px-4 flex items-center gap-3 rounded-xl bg-[#1A1A1A] hover:bg-[#1F1F1F] border border-[rgba(191,255,0,0.2)] text-[#F5F5F5] text-sm font-semibold transition-colors relative"
                >
                  <img
                    src="https://static.okx.com/cdn/assets/imgs/247/58E63FEA47A2B7D7.png"
                    alt="OKX"
                    className="w-7 h-7 rounded-lg object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://avatars.githubusercontent.com/u/47748494?s=48'; }}
                  />
                  <span className="flex-1 text-left">OKX Wallet</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[rgba(191,255,0,0.1)] text-[#BFFF00]">
                    Recommended
                  </span>
                </button>
                <button
                  onClick={() => handleConnect('metamask')}
                  className="w-full h-12 px-4 flex items-center gap-3 rounded-xl bg-[#1A1A1A] hover:bg-[#1F1F1F] border border-[rgba(255,255,255,0.08)] text-[#F5F5F5] text-sm font-semibold transition-colors"
                >
                  <img
                    src="https://raw.githubusercontent.com/MetaMask/metamask-extension/main/app/images/icon-128.png"
                    alt="MetaMask"
                    className="w-7 h-7 rounded-lg object-contain"
                  />
                  <span className="flex-1 text-left">MetaMask</span>
                </button>
                <button
                  onClick={() => handleConnect('walletconnect')}
                  className="w-full h-12 px-4 flex items-center gap-3 rounded-xl bg-[#1A1A1A] hover:bg-[#1F1F1F] border border-[rgba(255,255,255,0.08)] text-[#F5F5F5] text-sm font-semibold transition-colors"
                >
                  <img
                    src="https://avatars.githubusercontent.com/u/37784886?s=48&v=4"
                    alt="WalletConnect"
                    className="w-7 h-7 rounded-lg object-contain"
                  />
                  <span className="flex-1 text-left">WalletConnect</span>
                </button>
                <div className="h-px bg-[rgba(255,255,255,0.06)] my-1" />
                <button
                  onClick={() => handleConnect('demo')}
                  className="w-full h-12 px-4 flex items-center gap-3 rounded-xl bg-[#1A1A1A] hover:bg-[#1F1F1F] border border-[rgba(255,255,255,0.08)] text-[#A3A3A3] text-sm font-semibold transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#2A2A2A] flex items-center justify-center text-[#BFFF00]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  </div>
                  <span className="flex-1 text-left">Demo wallet</span>
                  <span className="text-[9px] uppercase tracking-wider text-[#666]">read-only</span>
                </button>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="mt-4 w-full text-xs text-[#A3A3A3] hover:text-[#F5F5F5]"
              >
                Cancel
              </button>
            </motion.div>
          </>
        )}

        {notifOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNotifOpen(false)}
              className="fixed inset-0 bg-black/60 z-[80]"
            />
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className="fixed right-4 top-[68px] bg-[#151515] border border-[rgba(255,255,255,0.1)] rounded-2xl p-4 z-[90] w-[360px] max-h-[70vh] overflow-y-auto shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#F5F5F5]">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="text-[10px] tabular text-[#BFFF00] bg-[rgba(191,255,0,0.08)] px-1.5 py-0.5 rounded">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {notifications.length > 0 && (
                    <>
                      <button
                        onClick={() => markAllRead()}
                        title="Mark all read"
                        className="w-7 h-7 flex items-center justify-center rounded text-[#666] hover:text-[#F5F5F5] hover:bg-[rgba(255,255,255,0.06)]"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => clearNotifs()}
                        title="Clear all"
                        className="w-7 h-7 flex items-center justify-center rounded text-[#666] hover:text-[#EF4444] hover:bg-[rgba(255,255,255,0.06)]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setNotifOpen(false)}
                    className="w-7 h-7 flex items-center justify-center rounded text-[#666] hover:text-[#F5F5F5] hover:bg-[rgba(255,255,255,0.06)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#666]">No notifications yet</div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {notifications.slice(0, 30).map((n) => (
                    <NotificationRow key={n.id} n={n} onClick={() => markRead(n.id)} />
                  ))}
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

function NotificationRow({ n, onClick }: { n: Notification; onClick: () => void }) {
  const Icon =
    n.kind === 'success'
      ? CheckCircle2
      : n.kind === 'error'
        ? AlertTriangle
        : n.kind === 'event'
          ? Sparkles
          : Info;
  const color =
    n.kind === 'success'
      ? 'text-[#22C55E]'
      : n.kind === 'error'
        ? 'text-[#EF4444]'
        : n.kind === 'event'
          ? 'text-[#BFFF00]'
          : 'text-[#A78BFA]';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-2.5 p-2.5 rounded-lg border border-[rgba(255,255,255,0.04)] transition-colors ${
        n.read ? 'bg-transparent' : 'bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)]'
      }`}
    >
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${color}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold truncate ${n.read ? 'text-[#A3A3A3]' : 'text-[#F5F5F5]'}`}>
          {n.title}
        </div>
        {n.body && <div className="text-[10px] text-[#666] truncate">{n.body}</div>}
        <div className="text-[10px] text-[#444] tabular mt-0.5">
          {new Date(n.timestamp).toLocaleTimeString()}
        </div>
      </div>
      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#BFFF00] mt-1.5" />}
    </button>
  );
}
