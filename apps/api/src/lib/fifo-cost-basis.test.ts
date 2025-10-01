import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { FifoCostBasis } from './fifo-cost-basis';

describe('FifoCostBasis', () => {
  it('should calculate simple profit correctly', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));

    const pnl = basis.sell('100', '70', new Date('2024-02-01'));

    // Profit = (70 - 50) * 100 = 2000
    expect(pnl.toString()).toBe('2000');
  });

  it('should calculate simple loss correctly', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));

    const pnl = basis.sell('100', '40', new Date('2024-02-01'));

    // Loss = (40 - 50) * 100 = -1000
    expect(pnl.toString()).toBe('-1000');
  });

  it('should use FIFO ordering for multiple lots', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01')); // First lot
    basis.addPurchase('100', '60', new Date('2024-02-01')); // Second lot

    // Sell 150 units - should use all of first lot (100 @ $50) and 50 from second lot (50 @ $60)
    const pnl = basis.sell('150', '70', new Date('2024-03-01'));

    // P&L = (70 - 50) * 100 + (70 - 60) * 50
    //     = 2000 + 500 = 2500
    expect(pnl.toString()).toBe('2500');

    // Should have 50 units remaining from second lot
    expect(basis.getTotalQuantity().toString()).toBe('50');
    expect(basis.getAverageCostBasis().toString()).toBe('60');
  });

  it('should handle partial sales correctly', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));

    // Sell only 50 units
    const pnl = basis.sell('50', '70', new Date('2024-02-01'));

    // P&L = (70 - 50) * 50 = 1000
    expect(pnl.toString()).toBe('1000');

    // Should have 50 units remaining
    expect(basis.getTotalQuantity().toString()).toBe('50');
    expect(basis.getAverageCostBasis().toString()).toBe('50');
  });

  it('should throw error when selling more than available', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));

    expect(() => {
      basis.sell('150', '70', new Date('2024-02-01'));
    }).toThrow('Insufficient cost basis');
  });

  it('should calculate weighted average cost basis', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));
    basis.addPurchase('100', '60', new Date('2024-02-01'));

    // Average = (100 * 50 + 100 * 60) / 200 = 11000 / 200 = 55
    expect(basis.getAverageCostBasis().toString()).toBe('55');
  });

  it('should handle Decimal inputs', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase(new Decimal('100.5'), new Decimal('50.25'), new Date('2024-01-01'));

    const pnl = basis.sell(new Decimal('100.5'), new Decimal('70.50'), new Date('2024-02-01'));

    // P&L = (70.50 - 50.25) * 100.5 = 20.25 * 100.5 = 2035.125
    expect(pnl.toString()).toBe('2035.125');
  });

  it('should handle string inputs', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));

    const pnl = basis.sell('50', '60', new Date('2024-02-01'));

    expect(pnl.toString()).toBe('500');
  });

  it('should clear all lots', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));
    basis.addPurchase('100', '60', new Date('2024-02-01'));

    basis.clear();

    expect(basis.getTotalQuantity().isZero()).toBe(true);
    expect(basis.getTotalCostBasis().isZero()).toBe(true);
  });

  it('should get remaining lots correctly', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '50', new Date('2024-01-01'));
    basis.addPurchase('100', '60', new Date('2024-02-01'));

    const lots = basis.getRemainingLots();

    expect(lots).toHaveLength(2);
    expect(lots[0].quantity.toString()).toBe('100');
    expect(lots[0].costBasisPerUnit.toString()).toBe('50');
    expect(lots[1].quantity.toString()).toBe('100');
    expect(lots[1].costBasisPerUnit.toString()).toBe('60');
  });

  it('should handle multiple sells across lots', () => {
    const basis = new FifoCostBasis();
    basis.addPurchase('100', '40', new Date('2024-01-01'));
    basis.addPurchase('100', '50', new Date('2024-02-01'));
    basis.addPurchase('100', '60', new Date('2024-03-01'));

    // First sale: 50 units @ $70
    const pnl1 = basis.sell('50', '70', new Date('2024-04-01'));
    expect(pnl1.toString()).toBe('1500'); // (70-40)*50

    // Second sale: 100 units @ $65
    const pnl2 = basis.sell('100', '65', new Date('2024-05-01'));
    // Uses remaining 50 from first lot (50@40) + 50 from second lot (50@50)
    expect(pnl2.toString()).toBe('2000'); // (65-40)*50 + (65-50)*50

    // Remaining: 50 from second lot @ $50 + 100 from third lot @ $60
    expect(basis.getTotalQuantity().toString()).toBe('150');
  });
});
