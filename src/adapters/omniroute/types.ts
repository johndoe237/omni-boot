export type OmniRouteClient={request(path:string,init?:RequestInit):Promise<any>;waitReady(timeoutMs?:number):Promise<void>;login(password:string):Promise<void>};
