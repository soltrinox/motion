import { visualElement } from ".."
import { checkTargetForNewValues, getOrigin } from "../utils/setters"
import { getBoundingBox } from "./projection/measure"
import { DOMVisualElementOptions, HTMLMutableState } from "./types"
import { buildHTMLStyles } from "./utils/build-html-styles"
import { isCSSVariable } from "./utils/is-css-variable"
import { parseDomVariant } from "./utils/parse-dom-variant"
import { isTransformProp } from "./utils/transform"
import { getDefaultValueType } from "./utils/value-types"

export function getComputedStyle(element: HTMLElement) {
    return window.getComputedStyle(element)
}

export const htmlMutableState = () => ({
    style: {},
    transform: {},
    transformKeys: [],
    transformOrigin: {},
    vars: {},
})

export const htmlVisualElement = visualElement<
    HTMLElement,
    HTMLMutableState,
    DOMVisualElementOptions
>({
    readNativeValue(domElement, key) {
        if (isTransformProp(key)) {
            return getDefaultValueType(key)?.default || 0
        } else {
            return (
                (isCSSVariable(key)
                    ? getComputedStyle(domElement).getPropertyValue(key)
                    : getComputedStyle(domElement)[key]) || 0
            )
        }
    },

    initMutableState: htmlMutableState,

    measureViewportBox(element, { transformPagePoint }) {
        return getBoundingBox(element, transformPagePoint)
    },

    /**
     * Reset the transform on the current Element. This is called as part
     * of a batched process across the entire layout tree. To remove this write
     * cycle it'd be interesting to see if it's possible to "undo" all the current
     * layout transforms up the tree in the same way this.getBoundingBoxWithoutTransforms
     * works
     */
    resetTransform(element, domElement, options) {
        /**
         * When we reset the transform of an element, there's a fair possibility that
         * the element will visually move from underneath the pointer, triggering attached
         * pointerenter/leave events. We temporarily suspend these while measurement takes place.
         */
        element.suspendHoverEvents()

        const { transformTemplate } = options
        domElement.style.transform = transformTemplate
            ? transformTemplate({}, "")
            : "none"

        // Ensure that whatever happens next, we restore our transform on the next frame
        element.scheduleRender()
    },

    restoreTransform(instance, mutableState) {
        instance.style.transform = mutableState.style.transform as string
    },

    removeValueFromMutableState(key, { vars, style }) {
        delete vars[key]
        delete style[key]
    },

    /**
     * Ensure that HTML and Framer-specific value types like `px`->`%` and `Color`
     * can be animated by Motion.
     */
    makeTargetAnimatable(
        element,
        { transition, transitionEnd, ...target },
        { transformValues },
        isMounted = true
    ) {
        let origin = getOrigin(target as any, transition || {}, element)

        /**
         * If Framer has provided a function to convert `Color` etc value types, convert them
         */
        if (transformValues) {
            if (transitionEnd)
                transitionEnd = transformValues(transitionEnd as any)
            if (target) target = transformValues(target as any)
            if (origin) origin = transformValues(origin as any)
        }

        if (isMounted) {
            checkTargetForNewValues(element, target, origin as any)
            const parsed = parseDomVariant(
                element,
                target,
                origin,
                transitionEnd
            )
            transitionEnd = parsed.transitionEnd
            target = parsed.target
        }

        return {
            transition,
            transitionEnd,
            ...target,
        }
    },

    build(latest, mutableState, projection, options) {
        // if (isVisible !== undefined) {
        //     mutableState.style.visibility = isVisible ? "visible" : "hidden"
        // }

        buildHTMLStyles(mutableState, latest, projection, options)
    },

    render(element, { style, vars }) {
        // Directly assign style into the Element's style prop. In tests Object.assign is the
        // fastest way to assign styles.
        Object.assign(element.style, style)

        // Loop over any CSS variables and assign those.
        for (const key in vars) {
            element.style.setProperty(key, vars[key] as string)
        }
    },
})