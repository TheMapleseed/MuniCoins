// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract SecureNFT is ERC721Enumerable, ERC721URIStorage, Ownable, ReentrancyGuard {
    // Base URI for metadata
    string private _baseTokenURI;
    
    // Mapping for encrypted metadata hashes
    mapping(uint256 => bytes32) private _encryptedHashes;
    
    // Events for tracking encrypted content updates
    event MetadataUpdated(uint256 indexed tokenId, bytes32 encryptedHash);

    constructor(
        string memory name,
        string memory symbol,
        string memory baseURI
    ) ERC721(name, symbol) {
        _baseTokenURI = baseURI;
    }

    function mint(
        address to,
        uint256 tokenId,
        bytes32 encryptedHash
    ) public onlyOwner {
        _safeMint(to, tokenId);
        _encryptedHashes[tokenId] = encryptedHash;
        emit MetadataUpdated(tokenId, encryptedHash);
    }

    function updateEncryptedHash(
        uint256 tokenId,
        bytes32 newEncryptedHash
    ) public {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "Not approved or owner");
        _encryptedHashes[tokenId] = newEncryptedHash;
        emit MetadataUpdated(tokenId, newEncryptedHash);
    }

    function getEncryptedHash(
        uint256 tokenId
    ) public view returns (bytes32) {
        require(_exists(tokenId), "Token does not exist");
        return _encryptedHashes[tokenId];
    }

    // Override required functions
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721, ERC721Enumerable) {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    function _burn(
        uint256 tokenId
    ) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
        delete _encryptedHashes[tokenId];
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, ERC721Enumerable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
} 