import { mock } from 'bun:test'
import * as vscodeMock from './mock-vscode.js'

mock.module('vscode', () => {
	return vscodeMock
})
