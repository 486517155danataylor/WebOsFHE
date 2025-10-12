// WebOsFHE.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract WebOsFHE is SepoliaConfig {
    struct EncryptedProcess {
        uint256 id;
        euint32 encryptedCode;
        euint32 encryptedMemory;
        euint32 encryptedState;
        uint256 timestamp;
    }
    
    struct ProcessResult {
        euint32 encryptedOutput;
        euint32 encryptedExecutionTime;
    }

    struct DecryptedProcess {
        string code;
        string memory;
        string state;
        bool isRevealed;
    }

    uint256 public processCount;
    mapping(uint256 => EncryptedProcess) public encryptedProcesses;
    mapping(uint256 => DecryptedProcess) public decryptedProcesses;
    mapping(uint256 => ProcessResult) public processResults;
    
    mapping(uint256 => uint256) private requestToProcessId;
    
    event ProcessCreated(uint256 indexed id, uint256 timestamp);
    event ExecutionRequested(uint256 indexed processId);
    event ExecutionCompleted(uint256 indexed processId);
    event DecryptionRequested(uint256 indexed processId);
    event ProcessDecrypted(uint256 indexed processId);
    
    modifier onlyOwner(uint256 processId) {
        _;
    }
    
    function createEncryptedProcess(
        euint32 encryptedCode,
        euint32 encryptedMemory,
        euint32 encryptedState
    ) public {
        processCount += 1;
        uint256 newId = processCount;
        
        encryptedProcesses[newId] = EncryptedProcess({
            id: newId,
            encryptedCode: encryptedCode,
            encryptedMemory: encryptedMemory,
            encryptedState: encryptedState,
            timestamp: block.timestamp
        });
        
        decryptedProcesses[newId] = DecryptedProcess({
            code: "",
            memory: "",
            state: "",
            isRevealed: false
        });
        
        emit ProcessCreated(newId, block.timestamp);
    }
    
    function requestProcessDecryption(uint256 processId) public onlyOwner(processId) {
        EncryptedProcess storage process = encryptedProcesses[processId];
        require(!decryptedProcesses[processId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(process.encryptedCode);
        ciphertexts[1] = FHE.toBytes32(process.encryptedMemory);
        ciphertexts[2] = FHE.toBytes32(process.encryptedState);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptProcess.selector);
        requestToProcessId[reqId] = processId;
        
        emit DecryptionRequested(processId);
    }
    
    function decryptProcess(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 processId = requestToProcessId[requestId];
        require(processId != 0, "Invalid request");
        
        EncryptedProcess storage eProcess = encryptedProcesses[processId];
        DecryptedProcess storage dProcess = decryptedProcesses[processId];
        require(!dProcess.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dProcess.code = results[0];
        dProcess.memory = results[1];
        dProcess.state = results[2];
        dProcess.isRevealed = true;
        
        emit ProcessDecrypted(processId);
    }
    
    function requestProcessExecution(uint256 processId) public onlyOwner(processId) {
        require(encryptedProcesses[processId].id != 0, "Process not found");
        
        emit ExecutionRequested(processId);
    }
    
    function submitExecutionResult(
        uint256 processId,
        euint32 encryptedOutput,
        euint32 encryptedExecutionTime
    ) public {
        processResults[processId] = ProcessResult({
            encryptedOutput: encryptedOutput,
            encryptedExecutionTime: encryptedExecutionTime
        });
        
        emit ExecutionCompleted(processId);
    }
    
    function requestResultDecryption(uint256 processId, uint8 resultType) public onlyOwner(processId) {
        ProcessResult storage result = processResults[processId];
        require(FHE.isInitialized(result.encryptedOutput), "No results available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (resultType == 0) {
            ciphertexts[0] = FHE.toBytes32(result.encryptedOutput);
        } else if (resultType == 1) {
            ciphertexts[0] = FHE.toBytes32(result.encryptedExecutionTime);
        } else {
            revert("Invalid result type");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptExecutionResult.selector);
        requestToProcessId[reqId] = processId * 10 + resultType;
    }
    
    function decryptExecutionResult(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToProcessId[requestId];
        uint256 processId = compositeId / 10;
        uint8 resultType = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string memory result = abi.decode(cleartexts, (string));
    }
    
    function getDecryptedProcess(uint256 processId) public view returns (
        string memory code,
        string memory memory,
        string memory state,
        bool isRevealed
    ) {
        DecryptedProcess storage p = decryptedProcesses[processId];
        return (p.code, p.memory, p.state, p.isRevealed);
    }
    
    function hasExecutionResults(uint256 processId) public view returns (bool) {
        return FHE.isInitialized(processResults[processId].encryptedOutput);
    }
}