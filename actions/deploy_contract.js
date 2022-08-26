const fcl = require("@onflow/fcl");
const { serverAuthorization } = require("./auth/authorization.js");
require("../flow/config.js");

const code = `
// This is an example implementation of a Flow Fungible Token
// It is not part of the official standard but it assumed to be
// very similar to how many NFTs would implement the core functionality.
import FungibleToken from 0xf8d6e0586b0a20c7
import MyMultiSig from 0xf8d6e0586b0a20c7
import FCLCrypto from 0xf8d6e0586b0a20c7

pub contract ExampleToken: FungibleToken {

    // Total supply of ExampleTokens in existence
    pub var totalSupply: UFix64

    pub let VaultStoragePath: StoragePath
    pub let VaultReceiverPath: PublicPath
    pub let VaultBalancePath: PublicPath
    pub let AdminStoragePath: StoragePath

    // TokensInitialized
    //
    // The event that is emitted when the contract is created
    pub event TokensInitialized(initialSupply: UFix64)

    // TokensWithdrawn
    //
    // The event that is emitted when tokens are withdrawn from a Vault
    pub event TokensWithdrawn(amount: UFix64, from: Address?)

    // TokensDeposited
    //
    // The event that is emitted when tokens are deposited to a Vault
    pub event TokensDeposited(amount: UFix64, to: Address?)

    // TokensMinted
    //
    // The event that is emitted when new tokens are minted
    pub event TokensMinted(amount: UFix64)

    // TokensBurned
    //
    // The event that is emitted when tokens are destroyed
    pub event TokensBurned(amount: UFix64)

    // AdminCreated
    //
    // The event that is emitted when a new admin resource is created
    pub event AdminCreated(address: Address?)

    // Multi Sig Events
    pub event ProposeAction(actionUUID: UInt64, proposer: Address)
    pub event ExecuteAction(actionUUID: UInt64, proposer: Address)

    // Vault
    //
    // Each user stores an instance of only the Vault in their storage
    // The functions in the Vault and governed by the pre and post conditions
    // in FungibleToken when they are called.
    // The checks happen at runtime whenever a function is called.
    //
    // Resources can only be created in the context of the contract that they
    // are defined in, so there is no way for a malicious user to create Vaults
    // out of thin air. A special Minter resource needs to be defined to mint
    // new tokens.
    //
    pub resource Vault: FungibleToken.Provider, FungibleToken.Receiver, FungibleToken.Balance {

        // The total balance of this vault
        pub var balance: UFix64

        // withdraw
        //
        // Function that takes an amount as an argument
        // and withdraws that amount from the Vault.
        //
        // It creates a new temporary Vault that is used to hold
        // the money that is being transferred. It returns the newly
        // created Vault to the context that called so it can be deposited
        // elsewhere.
        //
        pub fun withdraw(amount: UFix64): @FungibleToken.Vault {
            self.balance = self.balance - amount
            emit TokensWithdrawn(amount: amount, from: self.owner?.address)
            return <-create Vault(balance: amount)
        }

        // deposit
        //
        // Function that takes a Vault object as an argument and adds
        // its balance to the balance of the owners Vault.
        //
        // It is allowed to destroy the sent Vault because the Vault
        // was a temporary holder of the tokens. The Vault's balance has
        // been consumed and therefore can be destroyed.
        //
        pub fun deposit(from: @FungibleToken.Vault) {
            let vault <- from as! @ExampleToken.Vault
            self.balance = self.balance + vault.balance
            emit TokensDeposited(amount: vault.balance, to: self.owner?.address)
            vault.balance = 0.0
            destroy vault
        }

        // initialize the balance at resource creation time
        init(balance: UFix64) {
            self.balance = balance
        }

        destroy() {
            ExampleToken.totalSupply = ExampleToken.totalSupply - self.balance
        }
    }

    // createEmptyVault
    //
    // Function that creates a new Vault with a balance of zero
    // and returns it to the calling context. A user must call this function
    // and store the returned Vault in their storage in order to allow their
    // account to be able to receive deposits of this token type.
    //
    pub fun createEmptyVault(): @Vault {
        return <-create Vault(balance: 0.0)
    }

    // Interfaces + Resources
    pub resource interface AdminPublic {
        pub fun proposeAction(action: {MyMultiSig.Action}, signaturePayload: MyMultiSig.MessageSignaturePayload): UInt64
        pub fun executeAction(actionUUID: UInt64, signaturePayload: MyMultiSig.MessageSignaturePayload)
    }

    // Admin
    //
    // Resource to admin the token.
    //
    pub resource Admin: MyMultiSig.MultiSign, AdminPublic {
        access(contract) let multiSignManager: @MyMultiSig.Manager

        // ------- Manager -------   
        pub fun proposeAction(action: {MyMultiSig.Action}, signaturePayload: MyMultiSig.MessageSignaturePayload): UInt64 {
            self.validateTreasurySigner(identifier: action.intent, signaturePayload: signaturePayload)

            let uuid = self.multiSignManager.createMultiSign(action: action)
            emit ProposeAction(actionUUID: uuid, proposer: action.proposer)
            return uuid
        }

        /*
        Note that we pass through a reference to this entire
        treasury as a parameter here. So the action can do whatever it 
        wants. This means it's very imporant for the signers
        to know what they are signing.
        */
        pub fun executeAction(actionUUID: UInt64, signaturePayload: MyMultiSig.MessageSignaturePayload) {
            self.validateTreasurySigner(identifier: actionUUID.toString(), signaturePayload: signaturePayload)

            let selfRef: &Admin = &self as &Admin
            self.multiSignManager.executeAction(actionUUID: actionUUID, {"admin": selfRef})
            emit ExecuteAction(actionUUID: actionUUID, proposer: signaturePayload.signingAddr)
        }

        access(self) fun validateTreasurySigner(identifier: String, signaturePayload: MyMultiSig.MessageSignaturePayload) {
            // ------- Validate Address is a Signer on the Treasury -----
            let signers = self.multiSignManager.getSigners()
            assert(signers[signaturePayload.signingAddr] == true, message: "Address is not a signer on this Treasury")

            // ------- Validate Message --------
            // message format: {identifier hex}{blockId}
            let message = signaturePayload.message

            // ------- Validate Identifier -------
            let identifierHex = String.encodeHex(identifier.utf8)
            assert(
                identifierHex == message.slice(from: 0, upTo: identifierHex.length),
                message: "Invalid Message: incorrect identifier"
            )

            // ------ Validate Block ID --------
            MyMultiSig.validateMessageBlockId(blockHeight: signaturePayload.signatureBlock, messageBlockId: message.slice(from: identifierHex.length, upTo: message.length))

            // ------ Validate Signature -------
            let signatureValidationResponse = FCLCrypto.verifyUserSignatures(
                address: signaturePayload.signingAddr,
                message: String.encodeHex(signaturePayload.message.utf8),
                keyIndices: signaturePayload.keyIds,
                signatures: signaturePayload.signatures
            )

            assert(
                signatureValidationResponse == true,
                message: "Invalid Signature"
            )
        }

        // Reference to Manager //
        access(account) fun borrowManager(): &MyMultiSig.Manager {
            return &self.multiSignManager as &MyMultiSig.Manager
        }

        pub fun borrowManagerPublic(): &MyMultiSig.Manager{MyMultiSig.ManagerPublic} {
            return &self.multiSignManager as &MyMultiSig.Manager{MyMultiSig.ManagerPublic}
        }

        // mintTokens
        //
        // Function that mints new tokens, adds them to the total supply,
        // and returns them to the calling context.
        //
        pub fun mintTokens(amount: UFix64): @ExampleToken.Vault {
            pre {
                amount > 0.0: "Amount minted must be greater than zero"
            }
            ExampleToken.totalSupply = ExampleToken.totalSupply + amount
            emit TokensMinted(amount: amount)
            return <- create Vault(balance: amount)
        }

        // burnTokens
        //
        // Function that receives tokens, burns them, and removes them to the total supply.
        //
        pub fun burnTokens(from: @FungibleToken.Vault) {
            let vault <- from as! @ExampleToken.Vault
            ExampleToken.totalSupply = ExampleToken.totalSupply - vault.balance
            emit TokensBurned(amount: vault.balance)
            destroy vault
        }

        init(initialSigner: Address, initialThreshold: UInt) {
            self.multiSignManager <- MyMultiSig.createMultiSigManager(signers: [initialSigner], threshold: initialThreshold)
        }

        destroy() {
            destroy self.multiSignManager
        }
    }

    init(initialSigner: Address, initialThreshold: UInt) {
        self.totalSupply = 0.0
        self.VaultStoragePath = /storage/ExampleTokenVault
        self.VaultReceiverPath = /public/ExampleTokenReceiver
        self.VaultBalancePath = /public/ExampleTokenBalance
        self.AdminStoragePath = /storage/ExampleTokenAdmin

        let minter <- create Admin(initialSigner: initialSigner, initialThreshold: initialThreshold)
        self.account.save(<- minter, to: self.AdminStoragePath)

        // Emit an event that shows that the contract was initialized
        //
        emit TokensInitialized(initialSupply: self.totalSupply)
    }
}
`

async function deployContract(initialSigners, initialThreshold, code) {

  try {
    const transactionId = await fcl.mutate({
        cadence: `
        transaction(initialSigner: Address, initialThreshold: UInt, cadence: String) {
            prepare(signer: AuthAccount) {
                let code = cadence.utf8
                signer.contracts.add(
                    name: "ExampleToken",
                    code: code,
                    initialSigner: initialSigner,
                    initialThreshold: initialThreshold
                )
            }
        }
        `,
        args: (arg, t) => [
        arg(initialSigners, t.Address),
        arg(initialThreshold, t.UInt),
        arg(code, t.String)
        ],
        proposer: serverAuthorization,
        payer: serverAuthorization,
        authorizations: [serverAuthorization],
        limit: 999
    });

    console.log('Transaction Id', transactionId);
  } catch (e) {
    console.log(e);
  }
}

deployContract("0xf8d6e0586b0a20c7", "1", code);