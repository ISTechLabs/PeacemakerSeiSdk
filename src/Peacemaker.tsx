import React, { useState, useCallback, useEffect, FC } from 'react';
import { Unity, useUnityContext } from 'react-unity-webgl';
import { SeiWalletProvider, SupportedWalletInput } from '@sei-js/react';
import SeiAgent from './SeiAgent';

interface Fee {
    amount: [{ amount: string; denom: string }];
    gas: string;
}

interface LoginRequest {
    ChainId: string;
    RestUrl: string;
    RpcUrl: string;

    WalletList?: string[];
}

interface QueryRequest {
    ContractAddress: string;
    Query: any;
}

interface ExecuteRequest {
    SenderAddress: string;
    ContractAddress: string;
    Message: any;
    Fee: Fee;
    Memo?: string;
    Funds?: [{ amount: string; denom: string }];
}

interface UnityRequest {
    Id: string;
    Request: string;
}

export interface UnityEvent {
    id: string;
    name: string;
    data: any;
    // callback: (...parameters: any[]) => void;
}

export interface PeacemakerProps {
    loaderUrl: string;
    dataUrl: string;
    frameworkUrl: string;
    codeUrl: string;
    onUnityError?: (message: string) => void;
    onUnityLoad?: () => void;
    timeoutMs?: number;
    width?: string;
    height?: string;
}

const Peacemaker: FC<PeacemakerProps> = ({
    loaderUrl, // example value: 'unity/Build/Build.loader.js'
    dataUrl, // example value: 'unity/Build/Build.data'
    frameworkUrl, // example value: 'unity/Build/Build.framework.js'
    codeUrl, // example value: 'unity/Build/Build.wasm'
    onUnityError,
    onUnityLoad,
    timeoutMs = 30_000,
    width = '800px',
    height = '600px',
}) => {
    const { unityProvider, isLoaded, addEventListener, sendMessage, removeEventListener } = useUnityContext({
        loaderUrl,
        dataUrl,
        frameworkUrl,
        codeUrl,
    });
    const [errorMessage, setErrorMessage] = useState('');

    const [chainId, setChainId] = useState('');
    const [restUrl, setRestUrl] = useState('');
    const [rpcUrl, setRpcUrl] = useState('');
    const [walletList, setWalletList] = useState<SupportedWalletInput[]>([]);

    const [eventQueue, setEventQueue] = useState<UnityEvent[]>([]);

    useEffect(function () {
        const handleError = (...parameters: any[]) => {
            const [message] = parameters;
            console.error('Error occured in Unity:', message);
            setErrorMessage(message);
        };
        addEventListener('error', handleError);
        return () => {
            removeEventListener('error', handleError);
        };
    }, []);

    useEffect(() => {
        addEventListener('OnLogin', handleSeiLoginRequest);
        addEventListener('OnExecute', handleSeiExecuteRequest);
        addEventListener('OnQuery', handleSeiQueryRequest);

        return () => {
            removeEventListener('OnLogin', handleSeiLoginRequest);
        };
    }, []);

    useEffect(() => {
        if (onUnityLoad) {
            onUnityLoad();
        }
    }, [isLoaded]);

    useEffect(() => {
        if (onUnityError) {
            onUnityError(errorMessage);
        }
    }, [errorMessage]);

    const unwrapParameters = useCallback((parameters: any[]) => {
        const [stringData] = parameters;

        if (typeof stringData !== 'string') {
            throw new Error('Expected string data, got:' + typeof stringData);
        }

        const payload: UnityRequest = JSON.parse(stringData);

        if (!payload) {
            throw new Error('Expected non empty payload');
        }

        if (!payload.Id || !payload.Request) {
            throw new Error('Expected Id and Request in payload');
        }

        return payload;
    }, []);

    const handleSeiLoginRequest = useCallback((...parameters: any[]) => {
        const payload = unwrapParameters(parameters);

        const id = payload.Id;
        const request: LoginRequest = JSON.parse(payload.Request);

        if (!request.ChainId || !request.RestUrl || !request.RpcUrl) {
            throw new Error('Expected ChainId, RestUrl and RpcUrl in Login Request');
        }

        setChainId(request.ChainId);
        setRestUrl(request.RestUrl);
        setRpcUrl(request.RpcUrl);
        setWalletList((request.WalletList as SupportedWalletInput[]) || (['compass'] as SupportedWalletInput[]));

        const newEvent: UnityEvent = {
            id,
            name: 'OnLogin',
            data: request,
        };
        const newEventQueue = [...eventQueue, newEvent];

        setEventQueue(newEventQueue);
    }, []);

    const handleSeiExecuteRequest = useCallback((...parameters: any[]) => {
        const payload = unwrapParameters(parameters);

        const id = payload.Id;
        const request: ExecuteRequest = JSON.parse(payload.Request);

        if (!request.SenderAddress || !request.ContractAddress || !request.Message || !request.Fee) {
            throw new Error('Expected SenderAddress, ContractAddress, Message and Fee in Execute Request');
        }

        const message = JSON.parse(request.Message);

        const newEvent: UnityEvent = {
            id,
            name: 'OnExecute',
            data: {
                SenderAddress: request.SenderAddress,
                ContractAddress: request.ContractAddress,
                Message: message,
                Fee: request.Fee,
                Memo: request.Memo,
                Funds: request.Funds,
            },
        };
        const newEventQueue = [...eventQueue, newEvent];

        setEventQueue(newEventQueue);
    }, []);

    const handleSeiQueryRequest = useCallback((...parameters: any[]) => {
        const payload = unwrapParameters(parameters);

        const id = payload.Id;
        const request: QueryRequest = JSON.parse(payload.Request);

        if (!request.ContractAddress || !request.Query) {
            throw new Error('Expected ContractAddress and Query in Query Request');
        }

        const query = JSON.parse(request.Query);

        const newEvent: UnityEvent = {
            id,
            name: 'OnQuery',
            data: {
                ContractAddress: request.ContractAddress,
                Query: query,
            },
        };
        const newEventQueue = [...eventQueue, newEvent];

        setEventQueue(newEventQueue);
    }, []);

    return (
        <div
            style={{
                width: '100vw',
                height: '100vh',
            }}
        >
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                }}
            >
                {chainId && restUrl && rpcUrl && walletList && (
                    <SeiWalletProvider
                        chainConfiguration={{
                            chainId, // example value:'atlantic-2',
                            restUrl, // example value: 'https://rest.atlantic-2.seinetwork.io',
                            rpcUrl, // example value:'https://rpc.atlantic-2.seinetwork.io',
                        }}
                        wallets={walletList}
                        // autoConnect={(targetWallet as SupportedWalletInput) || undefined}
                    >
                        <SeiAgent
                            sendMessage={sendMessage}
                            isLoaded={isLoaded}
                            eventQueue={eventQueue}
                            setEventQueue={setEventQueue}
                            timeoutMs={timeoutMs}
                        />
                    </SeiWalletProvider>
                )}
                <Unity unityProvider={unityProvider} style={{ width, height }} />
            </div>
        </div>
    );
};

export default Peacemaker;
