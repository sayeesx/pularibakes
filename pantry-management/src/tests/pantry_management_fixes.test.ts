import { describe, it, expect, beforeEach } from 'vitest';
import { DemoRepository } from '../services/demoRepository';

describe('Pantry Management PWA Fixes Validation', () => {
  let repo: DemoRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new DemoRepository();
  });

  // 1 & 2. PACKET RELATIONSHIP & NO DUPLICATE PACKETS
  describe('Packet Relationship & Duplicate Prevention', () => {
    it('saves packet immediately to batch and updates existing quantity without creating duplicates', async () => {
      // 1. Create a production run
      const prod = (await repo.listProducts())[0];
      const batch = await repo.recordProductionRun({
        runNumber: 'RUN-20261107-001',
        productId: prod.id,
        productionDate: '2026-11-07',
        plannedQuantity: 10,
        actualQuantity: 10,
        unit: 'kg',
        operatorName: 'Test Cook',
        ingredientsConsumed: [],
      });

      // 2. Cook saves 50 packets of 3kg HM Packet
      const record1 = await repo.recordPacking({
        packingDate: '2026-11-07',
        productId: prod.id,
        productionRunId: batch.id,
        packetSize: '3kg HM Packet',
        packetsPacked: 50,
        operatorName: 'Test Cook',
      });

      expect(record1.packetsPacked).toBe(50);
      expect(record1.packetSize).toBe('3kg HM Packet');
      expect(record1.productName).toBe(prod.name);

      let records = await repo.listPackingRecords({ productId: prod.id });
      expect(records.length).toBe(1);
      expect(records[0].packetsPacked).toBe(50);

      // 3. Cook adjusts 3kg HM Packet to 75 packets (should update existing record, NOT insert duplicate)
      const record2 = await repo.recordPacking({
        packingDate: '2026-11-07',
        productId: prod.id,
        productionRunId: batch.id,
        packetSize: '3kg HM Packet',
        packetsPacked: 75,
        operatorName: 'Test Cook',
      });

      expect(record2.id).toBe(record1.id); // Same record ID, updated in place
      expect(record2.packetsPacked).toBe(75);

      records = await repo.listPackingRecords({ productId: prod.id });
      expect(records.length).toBe(1); // Still exactly 1 record, no duplicates!
      expect(records[0].packetsPacked).toBe(75);

      // 4. Cook adds another packet size: 2KG HM Packet -> 30 packets
      const record3 = await repo.recordPacking({
        packingDate: '2026-11-07',
        productId: prod.id,
        productionRunId: batch.id,
        packetSize: '2KG HM Packet',
        packetsPacked: 30,
        operatorName: 'Test Cook',
      });

      expect(record3.packetsPacked).toBe(30);

      records = await repo.listPackingRecords({ productId: prod.id });
      expect(records.length).toBe(2); // Two distinct sizes
      const hm3 = records.find((r) => r.packetSize === '3kg HM Packet');
      const hm2 = records.find((r) => r.packetSize === '2KG HM Packet');
      expect(hm3?.packetsPacked).toBe(75);
      expect(hm2?.packetsPacked).toBe(30);

      // 5. Cook clears 2KG HM Packet (sets to 0) -> removes it from batch
      await repo.recordPacking({
        packingDate: '2026-11-07',
        productId: prod.id,
        productionRunId: batch.id,
        packetSize: '2KG HM Packet',
        packetsPacked: 0,
        operatorName: 'Test Cook',
      });

      records = await repo.listPackingRecords({ productId: prod.id });
      expect(records.length).toBe(1);
      expect(records[0].packetSize).toBe('3kg HM Packet');
    });
  });

  // 4. BATCH COMPLETION - LOCK PRODUCED QUANTITY
  describe('Batch Completion Locking', () => {
    it('prevents editing produced quantity once batch is completed', async () => {
      const prod = (await repo.listProducts())[0];
      const batch = await repo.recordProductionRun({
        runNumber: 'RUN-20261107-002',
        productId: prod.id,
        productionDate: '2026-11-07',
        plannedQuantity: 10,
        actualQuantity: 10,
        unit: 'kg',
        operatorName: 'Test Cook',
        ingredientsConsumed: [],
      });

      // Mark batch as completed
      const allRuns = await repo.listProductionRuns();
      const runIdx = allRuns.findIndex((r) => r.id === batch.id);
      allRuns[runIdx].status = 'completed';
      localStorage.setItem('pb_runs', JSON.stringify(allRuns));

      // Attempting to modify actualQuantity on a completed batch should throw
      await expect(
        repo.updateProductionRun({
          runId: batch.id,
          actualQuantity: 15,
        })
      ).rejects.toThrow('Produced quantity cannot be edited once the batch is completed');

      // Unchanged actualQuantity update (e.g. notes only) should be permitted
      const updatedNotes = await repo.updateProductionRun({
        runId: batch.id,
        actualQuantity: 10,
        notes: 'Final notes',
      });
      expect(updatedNotes.notes).toBe('Final notes');
    });
  });

  // 6. PACKET STOCK VALIDATION
  describe('Packet Stock Validation', () => {
    it('provides stock tracking for packet types and marks out-of-stock items', async () => {
      const packagingItems = await repo.listPackagingItems();
      expect(packagingItems.length).toBeGreaterThan(0);

      // Verify that out-of-stock items are clearly identified
      const outOfStockItems = packagingItems.filter((p) => p.currentStock <= 0);
      expect(outOfStockItems.length).toBeGreaterThan(0);
      expect(outOfStockItems.some((p) => p.sizeLabel === '10 x 14 Packet')).toBe(true);

      // Verify available stock for in-stock items
      const inStockItem = packagingItems.find((p) => p.sizeLabel === '3kg HM Packet');
      expect(inStockItem).toBeDefined();
      expect(inStockItem!.currentStock).toBeGreaterThan(0);
    });
  });

  // 7. BATCH DELETION
  describe('Batch Deletion', () => {
    it('properly deletes batch so it no longer appears in Pantry Management', async () => {
      const prod = (await repo.listProducts())[0];
      const batch = await repo.recordProductionRun({
        runNumber: 'RUN-20261107-003',
        productId: prod.id,
        productionDate: '2026-11-07',
        plannedQuantity: 10,
        actualQuantity: 10,
        unit: 'kg',
        operatorName: 'Test Cook',
        ingredientsConsumed: [],
      });

      // Add a packet to this batch
      await repo.recordPacking({
        packingDate: '2026-11-07',
        productId: prod.id,
        productionRunId: batch.id,
        packetSize: '3kg HM Packet',
        packetsPacked: 25,
        operatorName: 'Test Cook',
      });

      let runs = await repo.listProductionRuns();
      expect(runs.some((r) => r.id === batch.id)).toBe(true);

      // Delete the run
      await repo.deleteProductionRun({
        runId: batch.id,
        restock: true,
        operatorName: 'Test Cook',
      });

      // Verify batch no longer exists in runs
      runs = await repo.listProductionRuns();
      expect(runs.some((r) => r.id === batch.id)).toBe(false);

      // Verify associated packing records are purged
      const packings = await repo.listPackingRecords();
      expect(packings.some((p) => p.productionRunId === batch.id)).toBe(false);
    });
  });
});

