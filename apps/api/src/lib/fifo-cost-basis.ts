import Decimal from 'decimal.js';

/**
 * Tax lot for FIFO (First-In, First-Out) cost basis tracking
 */
interface TaxLot {
  quantity: Decimal;
  costBasisPerUnit: Decimal;
  acquiredAt: Date;
}

/**
 * FIFO Cost Basis Calculator
 *
 * Implements First-In, First-Out accounting method for calculating
 * realized P&L on token sales/transfers.
 *
 * @example
 * const basis = new FifoCostBasis();
 * basis.addPurchase('100', '50.00', new Date('2024-01-01')); // Buy 100 @ $50
 * basis.addPurchase('50', '60.00', new Date('2024-02-01'));  // Buy 50 @ $60
 *
 * const pnl = basis.sell('75', '70.00', new Date('2024-03-01')); // Sell 75 @ $70
 * // Uses first 75 units: all 100 from first lot
 * // P&L = (70 - 50) * 75 = $1,500
 */
export class FifoCostBasis {
  private lots: TaxLot[] = [];

  /**
   * Add a purchase (buy) to the cost basis tracker
   *
   * @param quantity - Amount purchased
   * @param pricePerUnit - Cost per unit in USD
   * @param acquiredAt - Date of acquisition
   */
  addPurchase(
    quantity: string | number | Decimal,
    pricePerUnit: string | number | Decimal,
    acquiredAt: Date
  ): void {
    this.lots.push({
      quantity: new Decimal(quantity),
      costBasisPerUnit: new Decimal(pricePerUnit),
      acquiredAt,
    });
  }

  /**
   * Sell/dispose of tokens and calculate realized P&L
   *
   * @param quantity - Amount sold
   * @param salePrice - Sale price per unit in USD
   * @param soldAt - Date of sale
   * @returns Realized P&L in USD (positive = profit, negative = loss)
   */
  sell(
    quantity: string | number | Decimal,
    salePrice: string | number | Decimal,
    soldAt: Date
  ): Decimal {
    let remaining = new Decimal(quantity);
    let totalPnl = new Decimal(0);
    const price = new Decimal(salePrice);

    while (remaining.greaterThan(0) && this.lots.length > 0) {
      const lot = this.lots[0];
      const sellAmount = Decimal.min(remaining, lot.quantity);

      // Calculate P&L for this portion
      // P&L = (salePrice - costBasis) * quantity
      const pnl = price.minus(lot.costBasisPerUnit).times(sellAmount);
      totalPnl = totalPnl.plus(pnl);

      // Update lot quantity
      lot.quantity = lot.quantity.minus(sellAmount);
      remaining = remaining.minus(sellAmount);

      // Remove lot if fully consumed
      if (lot.quantity.isZero()) {
        this.lots.shift();
      }
    }

    if (remaining.greaterThan(0)) {
      throw new Error(
        `Insufficient cost basis: trying to sell ${quantity} but only ${new Decimal(quantity).minus(remaining)} available in lots`
      );
    }

    return totalPnl;
  }

  /**
   * Get current cost basis for remaining holdings
   *
   * @returns Total cost basis in USD for all remaining lots
   */
  getTotalCostBasis(): Decimal {
    return this.lots.reduce(
      (total, lot) => total.plus(lot.quantity.times(lot.costBasisPerUnit)),
      new Decimal(0)
    );
  }

  /**
   * Get total quantity remaining across all lots
   */
  getTotalQuantity(): Decimal {
    return this.lots.reduce(
      (total, lot) => total.plus(lot.quantity),
      new Decimal(0)
    );
  }

  /**
   * Get weighted average cost basis per unit
   */
  getAverageCostBasis(): Decimal {
    const totalQuantity = this.getTotalQuantity();
    if (totalQuantity.isZero()) {
      return new Decimal(0);
    }

    return this.getTotalCostBasis().dividedBy(totalQuantity);
  }

  /**
   * Get all remaining tax lots (for inspection/debugging)
   */
  getRemainingLots(): ReadonlyArray<Readonly<TaxLot>> {
    return this.lots.map(lot => ({
      quantity: lot.quantity,
      costBasisPerUnit: lot.costBasisPerUnit,
      acquiredAt: lot.acquiredAt,
    }));
  }

  /**
   * Clear all lots (reset state)
   */
  clear(): void {
    this.lots = [];
  }
}
