require('dotenv').config();
const OpenAI = require('openai');

/**
 * Cost Calculator for Reflection/Curation
 */
class CostTracker {
  constructor() {
    this.costs = {
      'gpt-4o': {
        input: 2.50 / 1_000_000,   // $2.50 per 1M input tokens
        output: 10.00 / 1_000_000   // $10.00 per 1M output tokens
      },
      'gpt-4o-mini': {
        input: 0.150 / 1_000_000,  // $0.15 per 1M input tokens
        output: 0.600 / 1_000_000   // $0.60 per 1M output tokens
      },
      'gpt-4': {
        input: 30.00 / 1_000_000,
        output: 60.00 / 1_000_000
      }
    };
    
    this.totalCost = 0;
    this.operations = [];
  }

  /**
   * Track a single API call
   */
  track(operation, model, inputTokens, outputTokens) {
    const modelCost = this.costs[model];
    
    if (!modelCost) {
      console.warn(`Unknown model: ${model}`);
      return;
    }
    
    const cost = (inputTokens * modelCost.input) + (outputTokens * modelCost.output);
    
    this.operations.push({
      operation,
      model,
      inputTokens,
      outputTokens,
      cost
    });
    
    this.totalCost += cost;
    
    return cost;
  }

  /**
   * Generate cost report
   */
  report() {
    console.log('\n💰 COST REPORT');
    console.log('═'.repeat(70));
    
    // Group by operation
    const byOperation = {};
    this.operations.forEach(op => {
      if (!byOperation[op.operation]) {
        byOperation[op.operation] = { count: 0, cost: 0 };
      }
      byOperation[op.operation].count++;
      byOperation[op.operation].cost += op.cost;
    });
    
    console.log('\nBy Operation:');
    Object.entries(byOperation).forEach(([op, data]) => {
      console.log(`  ${op}: ${data.count}x = $${data.cost.toFixed(4)}`);
    });
    
    // Group by model
    const byModel = {};
    this.operations.forEach(op => {
      if (!byModel[op.model]) {
        byModel[op.model] = { count: 0, cost: 0, tokens: 0 };
      }
      byModel[op.model].count++;
      byModel[op.model].cost += op.cost;
      byModel[op.model].tokens += op.inputTokens + op.outputTokens;
    });
    
    console.log('\nBy Model:');
    Object.entries(byModel).forEach(([model, data]) => {
      console.log(`  ${model}: ${data.count} calls, ${data.tokens.toLocaleString()} tokens = $${data.cost.toFixed(4)}`);
    });
    
    console.log('\n' + '═'.repeat(70));
    console.log(`TOTAL COST: $${this.totalCost.toFixed(4)}`);
    console.log('═'.repeat(70) + '\n');
  }

  /**
   * Save to file
   */
  save(filename = 'cost_report.json') {
    const fs = require('fs');
    fs.writeFileSync(filename, JSON.stringify({
      totalCost: this.totalCost,
      operations: this.operations,
      timestamp: new Date().toISOString()
    }, null, 2));
  }
}

module.exports = CostTracker;