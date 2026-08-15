import { memo } from 'react';
import { useDiagnosisStore, type Diagnosis } from '../../store/diagnosisStore';
import { invoke } from '@tauri-apps/api/core';

export interface CapturedRequest {
  id: number;
  method: string;
  url: string;
  request_headers: [string, string][];
  request_body: string;
  response_status: number;
  response_headers: [string, string][];
  response_body: string;
  timestamp: number;
  duration_ms: number;
}

interface RequestTableProps {
  requests: CapturedRequest[];
  selectedReq: CapturedRequest | null;
  onSelect: (req: CapturedRequest) => void;
  getMethodColor: (method: string) => string;
  getStatusColor: (status: number) => string;
  hasSensitiveData: (req: CapturedRequest) => boolean;
}

export const RequestTable = memo(({
  requests,
  selectedReq,
  onSelect,
  getMethodColor,
  getStatusColor,
  hasSensitiveData,
}: RequestTableProps) => {
  return (
    <div className="flex-1 overflow-y-auto">
      {requests.map((req) => {
        const isSelected = selectedReq?.id === req.id;
        return (
          <div
            key={req.id}
            onClick={() => onSelect(req)}
            className={`p-3 border-b border-white/5 cursor-pointer text-sm transition-colors ${
              isSelected
                ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                : 'hover:bg-white/5 border-l-2 border-l-transparent'
            }`}
          >
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center space-x-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getMethodColor(req.method)}`}>
                  {req.method}
                </span>
                <span className={`font-mono text-xs font-bold ${getStatusColor(req.response_status)}`}>
                  {req.response_status}
                </span>
                {req.response_status >= 400 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const triggerId = `proxy:${req.id}`;
                      const store = useDiagnosisStore.getState();
                      if (!store.enabled) return;
                      store.setLoading(triggerId);
                      invoke<Diagnosis>('diagnose_issue', {
                        trigger: {
                          type: 'proxy_error',
                          request_id: req.id,
                          status_code: req.response_status,
                          url: req.url,
                          method: req.method,
                        },
                        repoPath: null,
                      })
                        .then((d) => useDiagnosisStore.getState().setDiagnosis(triggerId, d))
                        .catch((err) => useDiagnosisStore.getState().setError(triggerId, String(err)));
                    }}
                    className="px-2 py-1 text-[10px] font-bold rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/30 border border-violet-500/30"
                  >
                    Diagnose
                  </button>
                )}
                {hasSensitiveData(req) && (
                  <span className="text-[10px] text-yellow-400 flex items-center" title="Sensitive data (Auth/Cookie)">
                    🔒
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-3 text-xs text-gray-500">
                <span>{req.duration_ms}ms</span>
                <span>{new Date(req.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
            <div className="font-mono text-xs text-gray-300 truncate opacity-80">{req.url}</div>
          </div>
        );
      })}
      {requests.length === 0 && (
        <div className="p-8 text-center text-gray-500 text-sm">
          No requests match your filters.
        </div>
      )}
    </div>
  );
});
