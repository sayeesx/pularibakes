import React, { useState, useMemo } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { StockMovement, MovementType } from '../../types';
import { TbSearch, TbArrowUpRight, TbArrowDownLeft, TbFilter, TbCalendar, TbUser } from 'react-icons/tb';

interface StockLedgerViewProps {
  movements: StockMovement[];
}

export const StockLedgerView: React.FC<StockLedgerViewProps> = ({ movements }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      const matchesSearch =
        m.itemName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (m.reason && m.reason.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      if (typeFilter === 'all') return true;
      if (typeFilter === 'purchases') return m.movementType === 'purchase';
      if (typeFilter === 'production_usage') return m.movementType === 'production_consumption';
      if (typeFilter === 'production_output') return m.movementType === 'production_output';
      if (typeFilter === 'wastage') return m.movementType === 'wastage';
      if (typeFilter === 'correction') return m.movementType === 'adjustment';
      if (typeFilter === 'reversal') return m.movementType === 'cancellation_reversal';

      return true;
    });
  }, [movements, searchTerm, typeFilter]);

  const getMovementBadge = (type: MovementType) => {
    switch (type) {
      case 'purchase':
        return <Badge variant="success">Purchase</Badge>;
      case 'production_consumption':
        return <Badge variant="default">Batch Usage</Badge>;
      case 'production_output':
        return <Badge variant="success">Finished Output</Badge>;
      case 'wastage':
        return <Badge variant="danger">Wastage</Badge>;
      case 'adjustment':
        return <Badge variant="warning">Count Audit</Badge>;
      case 'cancellation_reversal':
        return <Badge variant="danger">Reversal</Badge>;
      case 'opening':
        return <Badge variant="default">Opening Stock</Badge>;
      default:
        return <Badge variant="default">{type}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="space-y-2.5">
        <Input
          placeholder="Search by ingredient, batch #, reference or reason..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          leftAddon={<TbSearch className="w-4 h-4" />}
        />

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: `All (${movements.length})` },
            { id: 'production_usage', label: 'Batch Usage' },
            { id: 'production_output', label: 'Output' },
            { id: 'purchases', label: 'Purchases' },
            { id: 'wastage', label: 'Wastage' },
            { id: 'correction', label: 'Adjustments' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTypeFilter(tab.id)}
              className={`px-3 py-1.5 rounded-full font-semibold transition-all whitespace-nowrap select-none press-apple ${
                typeFilter === tab.id
                  ? 'bg-forest-700 text-white'
                  : 'bg-white text-charcoal-muted border border-charcoal-border hover:bg-forest-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      {filteredMovements.length === 0 ? (
        <Card className="text-center py-10 text-charcoal-muted text-sm">
          No stock transactions found matching your criteria.
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredMovements.map((mov) => {
            const isPositive = mov.quantity > 0;

            return (
              <Card
                key={mov.id}
                padding="sm"
                className="hover:border-forest-600/40 transition-all flex flex-col gap-1.5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isPositive
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {isPositive ? (
                        <TbArrowUpRight className="w-4 h-4" />
                      ) : (
                        <TbArrowDownLeft className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-charcoal leading-tight">
                        {mov.itemName}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-charcoal-muted mt-0.5">
                        <span>{mov.reference}</span>
                        <span>•</span>
                        <span>{new Date(mov.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`text-sm font-extrabold ${
                        isPositive ? 'text-emerald-700' : 'text-charcoal'
                      }`}
                    >
                      {isPositive ? `+${mov.quantity}` : mov.quantity} {mov.unit}
                    </span>
                    <div className="mt-0.5">{getMovementBadge(mov.movementType)}</div>
                  </div>
                </div>

                {/* Ledger balances snapshot */}
                <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-charcoal-border/50 text-[11px]">
                  <span className="text-charcoal-muted">
                    Balance: <span className="font-semibold">{mov.previousBalance}</span> →{' '}
                    <span className="font-bold text-forest-900">{mov.newBalance} {mov.unit}</span>
                  </span>

                  <span className="text-charcoal-muted">
                    By: <span className="font-medium text-charcoal">{mov.operatorName}</span>
                  </span>
                </div>

                {mov.reason && (
                  <p className="text-[11px] text-charcoal-muted bg-canvas p-1.5 rounded-lg border border-charcoal-border/50">
                    <span className="font-semibold text-charcoal">Note:</span> {mov.reason}
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
