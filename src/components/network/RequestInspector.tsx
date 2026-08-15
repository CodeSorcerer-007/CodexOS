import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DiagnosisCard } from '../DiagnosisCard';
import type { CapturedRequest } from './RequestTable';

interface RequestInspectorProps {
  selectedReq: CapturedRequest | null;
  onReplay: (req: CapturedRequest) => void;
  formatBody: (body: string, headers: [string, string][]) => string;
  getStatusColor: (status: number) => string;
}

export const RequestInspector = memo(({
  selectedReq,
  onReplay,
  formatBody,
  getStatusColor,
}: RequestInspectorProps) => {
  return (
    <div className="w-1/2 relative bg-[#060910] overflow-hidden">
      <AnimatePresence mode="wait">
        {selectedReq ? (
          <motion.div
            key={selectedReq.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="h-full flex flex-col p-4 overflow-y-auto"
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="font-bold text-gray-200 mb-1">Request Details</h3>
                <div className="font-mono text-xs text-indigo-300 break-all">
                  {selectedReq.method} {selectedReq.url}
                </div>
              </div>
              <button
                onClick={() => onReplay(selectedReq)}
                className="px-3 py-1.5 rounded text-xs font-bold transition-colors bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 border border-indigo-500/30"
              >
                ▶ Replay
              </button>
            </div>

            {/* Request Headers */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Request Headers</h4>
              <div className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                {selectedReq.request_headers.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <tbody>
                      {selectedReq.request_headers.map((h, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="py-1 pr-4 text-blue-300 whitespace-nowrap align-top">{h[0]}:</td>
                          <td className="py-1 break-all">{h[1]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="text-gray-500 italic">No headers</span>
                )}
              </div>
            </div>

            {/* Request Body */}
            {selectedReq.request_body && (
              <div className="mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Request Body</h4>
                <pre className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-green-300 overflow-x-auto whitespace-pre-wrap">
                  {formatBody(selectedReq.request_body, selectedReq.request_headers)}
                </pre>
              </div>
            )}

            {/* Response Headers */}
            <div className="mb-6">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center space-x-2">
                <span>Response Headers</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] bg-white/5 ${getStatusColor(selectedReq.response_status)}`}>
                  Status: {selectedReq.response_status}
                </span>
              </h4>
              <div className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-gray-300 overflow-x-auto">
                {selectedReq.response_headers.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <tbody>
                      {selectedReq.response_headers.map((h, i) => (
                        <tr key={i} className="border-b border-white/5 last:border-0">
                          <td className="py-1 pr-4 text-purple-300 whitespace-nowrap align-top">{h[0]}:</td>
                          <td className="py-1 break-all">{h[1]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <span className="text-gray-500 italic">No headers</span>
                )}
              </div>
            </div>

            {/* Response Body */}
            <div className="mb-4">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Response Body</h4>
              <pre className="bg-black/50 border border-white/5 rounded-lg p-3 font-mono text-xs text-orange-300 overflow-x-auto whitespace-pre-wrap min-h-[100px]">
                {selectedReq.response_body ? (
                  formatBody(selectedReq.response_body, selectedReq.response_headers)
                ) : (
                  <span className="text-gray-500 italic">Empty body</span>
                )}
              </pre>
            </div>

            {/* Diagnosis Card — shown for 4xx/5xx responses */}
            {selectedReq.response_status >= 400 && (
              <div className="mb-4">
                <DiagnosisCard triggerId={`proxy:${selectedReq.id}`} />
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full flex items-center justify-center text-gray-500 text-sm"
          >
            Select a request to inspect
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
