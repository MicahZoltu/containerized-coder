import { Operation } from "./types/operations"

export interface OperationStore {
	getAll(): Operation[]
	add(op: Operation): void
	update(id: string, updates: Partial<Operation>): void
	remove(id: string): void
	clear(): void
	get(id: string): Operation | undefined
}

export class InMemoryOperationStore implements OperationStore {
	private ops: Map<string, Operation> = new Map()
	private order: string[] = []

	getAll(): Operation[] {
		return this.order.map((id) => this.ops.get(id)!)
	}

	add(op: Operation): void {
		this.ops.set(op.id, op)
		this.order.push(op.id)
	}

	update(id: string, updates: Partial<Operation>): void {
		const op = this.ops.get(id)
		if (op) {
			this.ops.set(id, { ...op, ...updates } as Operation)
		}
	}

	remove(id: string): void {
		this.ops.delete(id)
		this.order = this.order.filter((i) => i !== id)
	}

	clear(): void {
		this.ops.clear()
		this.order = []
	}

	get(id: string): Operation | undefined {
		return this.ops.get(id)
	}
}
