import { useRef, useCallback } from 'react';

/**
 * API 호출과 같은 함수를 일정 주기로만 실행되도록 제한(throttle)하는 커스텀 훅.
 * @param {Function} callback - Throttling을 적용할 콜백 함수.
 * @param {number} delay - Throttling 간격 (밀리초).
 * @returns {Function} Throttling이 적용된 함수.
 */
export const useThrottle = (callback, delay) => {
    const lastCall = useRef(0);
    const timeoutRef = useRef(null);

    return useCallback((...args) => {
        const now = new Date().getTime();
        if (now - lastCall.current < delay) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                lastCall.current = now;
                callback(...args);
            }, delay - (now - lastCall.current));
            return;
        }
        lastCall.current = now;
        callback(...args);
    }, [callback, delay]);
};
