// Base guardrail class — KRouter9 minimal (OmniRoute concept, self-contained).
// Fail-open: guards never throw; errors return { block: false }.
export class BaseGuardrail {
  constructor(name, options = {}) {
    this.name = name;
    this.enabled = options.enabled !== false;
    this.priority = options.priority ?? 100;
  }
  async preCall(_payload, _context) { return { block: false }; }
  async postCall(_response, _context) { return { block: false }; }
}
