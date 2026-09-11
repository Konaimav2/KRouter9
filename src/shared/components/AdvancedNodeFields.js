"use client";

import PropTypes from "prop-types";
import { Input } from "@/shared/components";

// "curl-like" per-node request options: connect timeout + custom headers.
// Shared by Add-/EditCompatibleNodeModal. Header parse/serialize lives in
// @/shared/utils/nodeHeaders (unit-tested).
export default function AdvancedNodeFields({ timeoutMs, onTimeoutMs, headersText, onHeadersText }) {
  return (
    <div className="flex flex-col gap-4">
      <Input
        label="Request Timeout (ms)"
        type="number"
        min="0"
        value={timeoutMs}
        onChange={(e) => onTimeoutMs(e.target.value)}
        placeholder="60000"
        hint="Max time to wait for response headers. Blank = inherit provider default."
      />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-primary">Custom Headers</label>
        <textarea
          className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-primary"
          value={headersText}
          onChange={(e) => onHeadersText(e.target.value)}
          placeholder={"X-Example: value\nX-Another: value"}
        />
        <span className="text-xs text-text-muted">
          One <code>Key: Value</code> per line. Sent on every upstream request from this node.
        </span>
      </div>
    </div>
  );
}

AdvancedNodeFields.propTypes = {
  timeoutMs: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onTimeoutMs: PropTypes.func.isRequired,
  headersText: PropTypes.string.isRequired,
  onHeadersText: PropTypes.func.isRequired,
};
