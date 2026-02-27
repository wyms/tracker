import { useAppStore } from '../../store/useAppStore';

const typeStyles = {
  info: { border: 'rgba(0,229,255,0.4)', icon: 'i', iconColor: '#00E5FF' },
  warning: { border: 'rgba(255,87,34,0.4)', icon: '!', iconColor: '#FF5722' },
  success: { border: 'rgba(76,175,80,0.4)', icon: '\u2713', iconColor: '#4CAF50' },
};

export function NotificationToast() {
  const { notifications, dismissNotification } = useAppStore();

  if (notifications.length === 0) return null;

  return (
    <div className="absolute bottom-12 right-4 z-20 flex flex-col gap-2 w-80">
      {notifications.map((n) => {
        const style = typeStyles[n.type];
        return (
          <div
            key={n.id}
            className="rounded-lg border backdrop-blur-sm p-3 animate-slide-in"
            style={{
              background: 'rgba(13,27,42,0.95)',
              borderColor: style.border,
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                style={{
                  background: `${style.iconColor}20`,
                  color: style.iconColor,
                }}
              >
                {style.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-gray-200">{n.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">{n.message}</div>
              </div>
              <button
                onClick={() => dismissNotification(n.id)}
                className="text-gray-500 hover:text-gray-300 text-sm leading-none shrink-0"
              >
                &times;
              </button>
            </div>
          </div>
        );
      })}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
