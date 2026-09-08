import { z } from "zod";
export const providerSchema=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9-]*$/),name:z.string().min(1),type:z.string().min(1),apiType:z.string().optional(),baseUrl:z.string().url()});
export const modelSchema=z.object({id:z.string().min(1),name:z.string().min(1)});
export const connectionSchema=z.object({id:z.string().min(1),name:z.string().min(1),env:z.string().regex(/^[A-Z][A-Z0-9_]*$/),credential:z.string().min(1)});
export const comboModelSchema=z.object({kind:z.literal("model"),provider:z.string().min(1),model:z.string().min(1),connectionId:z.string().optional()});
export const comboRefSchema=z.object({kind:z.literal("combo-ref"),comboName:z.string().min(1)});
export const comboSchema=z.object({name:z.string().regex(/^[a-z0-9][a-z0-9-]*$/),strategy:z.string().min(1),models:z.array(z.union([comboModelSchema,comboRefSchema]))});
export type Provider=z.infer<typeof providerSchema>; export type Model=z.infer<typeof modelSchema>; export type Connection=z.infer<typeof connectionSchema>; export type Combo=z.infer<typeof comboSchema>;
