export interface Nation {
    code: string;
    name: string;
    fi: string;
}
export declare const NATIONS: Nation[];
/** Resolve a stored code to its nation entry (undefined for custom/free-text values). */
export declare function nationByCode(code: string | null | undefined): Nation | undefined;
