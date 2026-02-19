let activeTooltip: HTMLElement | null = null
let tooltipTarget: HTMLElement | null = null

export function showTooltip(
	content: string,
	target: HTMLElement,
	position: "right" | "top" | "bottom" = "right",
	offset = 8,
): void {
	hideTooltip()

	const tooltip = document.createElement("div")
	tooltip.className = "tooltip"
	tooltip.innerHTML = content
	document.body.appendChild(tooltip)

	const rect = target.getBoundingClientRect()
	const tooltipRect = tooltip.getBoundingClientRect()

	let left = 0
	let top = 0

	switch (position) {
		case "right":
			left = rect.right + offset
			top = rect.top + rect.height / 2 - tooltipRect.height / 2
			break
		case "top":
			left = rect.left + rect.width / 2 - tooltipRect.width / 2
			top = rect.top - tooltipRect.height - offset
			if (top < offset) {
				top = rect.bottom + offset
			}
			break
		case "bottom":
			left = rect.left + rect.width / 2 - tooltipRect.width / 2
			top = rect.bottom + offset
			break
	}

	// Keep tooltip within viewport
	const maxLeft = window.innerWidth - tooltipRect.width - 8
	const maxTop = window.innerHeight - tooltipRect.height - 8
	left = Math.max(8, Math.min(left, maxLeft))
	top = Math.max(8, Math.min(top, maxTop))

	tooltip.style.left = `${left}px`
	tooltip.style.top = `${top}px`

	activeTooltip = tooltip
	tooltipTarget = target
}

export function hideTooltip(): void {
	if (activeTooltip) {
		activeTooltip.remove()
		activeTooltip = null
		tooltipTarget = null
	}
}

export function isTooltipActiveFor(target: HTMLElement): boolean {
	return tooltipTarget === target
}

export function escapeHtml(str: string): string {
	const div = document.createElement("div")
	div.textContent = str
	return div.innerHTML
}
