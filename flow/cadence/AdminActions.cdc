import MyMultiSig from "./MyMultiSig.cdc"
import ExampleToken from "./ExampleToken.cdc"
import FungibleToken from "./utility/FungibleToken.cdc"

pub contract AdminActions {

  ///////////
  // Events
  ///////////

  // MintToken
  pub event MintTokenToAccountActionCreated(recipientAddr: Address, amount: UFix64)
  pub event MintTokenToAccountActionExecuted(recipientAddr: Address, amount: UFix64)

  // Add Signer
  pub event AddSignerActionCreated(address: Address)
  pub event AddSignerActionExecuted(address: Address, treasuryAddr: Address)
  
  // Remove Signer
  pub event RemoveSignerActionCreated(address: Address)
  pub event RemoveSignerActionExecuted(address: Address, treasuryAddr: Address)

  // Update Threshold
  pub event UpdateThresholdActionCreated(threshold: UInt)
  pub event UpdateThresholdActionExecuted(oldThreshold: UInt, newThreshold: UInt, treasuryAddr: Address)

  // Destroy Action
  pub event DestroyActionActionCreated(actionUUID: UInt64)
  pub event DestroyActionActionExecuted(actionUUID: UInt64, treasuryAddr: Address)

  // Mints `amount` of tokens to `recipientVault`
  pub struct MintToken: MyMultiSig.Action {
    pub let intent: String
    pub let proposer: Address
    pub let recipientVault: Capability<&{FungibleToken.Receiver}>
    pub let amount: UFix64

    access(account) fun execute(_ params: {String: AnyStruct}) {
      let adminRef: &ExampleToken.Admin = params["admin"]! as! &ExampleToken.Admin
      let mintedTokens <- adminRef.mintTokens(amount: self.amount)
      self.recipientVault.borrow()!.deposit(from: <- mintedTokens)

      emit MintTokenToAccountActionExecuted(
        recipientAddr: self.recipientVault.borrow()!.owner!.address,
        amount: self.amount
      )
    }

    init(recipientVault: Capability<&{FungibleToken.Receiver}>, amount: UFix64, proposer: Address) {
      pre {
        amount > 0.0 : "Amount should be higher than 0.0"  
      }

      self.intent = "Mint "
                        .concat(amount.toString())
                        .concat(" ")
                        .concat(" tokens to ")
                        .concat(recipientVault.borrow()!.owner!.address.toString())
      self.recipientVault = recipientVault
      self.amount = amount
      self.proposer = proposer

      emit MintTokenToAccountActionCreated(
        recipientAddr: recipientVault.borrow()!.owner!.address,
        amount: amount
      )
    }
  }

  // Add a new signer to the admin
  pub struct AddSigner: MyMultiSig.Action {
    pub let signer: Address
    pub let intent: String
    pub let proposer: Address

    access(account) fun execute(_ params: {String: AnyStruct}) {
      let adminRef: &ExampleToken.Admin = params["admin"]! as! &ExampleToken.Admin

      let manager = adminRef.borrowManager()
      manager.addSigner(signer: self.signer)

      emit AddSignerActionExecuted(address: self.signer, treasuryAddr: adminRef.owner!.address)
    }

    init(signer: Address, proposer: Address) {
      self.proposer = proposer
      self.signer = signer
      self.intent = "Add account "
                      .concat(signer.toString())
                      .concat(" as a signer.")
      emit AddSignerActionCreated(address: signer)
    }
  }

  // Remove a signer from the admin
  pub struct RemoveSigner: MyMultiSig.Action {
    pub let signer: Address
    pub let intent: String
    pub let proposer: Address

    access(account) fun execute(_ params: {String: AnyStruct}) {
      let adminRef: &ExampleToken.Admin = params["admin"]! as! &ExampleToken.Admin

      let manager = adminRef.borrowManager()
      manager.removeSigner(signer: self.signer)
      emit RemoveSignerActionExecuted(address: self.signer, treasuryAddr: adminRef.owner!.address)
    }

    init(signer: Address, proposer: Address) {
      self.proposer = proposer
      self.signer = signer
      self.intent = "Remove "
                      .concat(signer.toString())
                      .concat(" as a signer.")
      emit RemoveSignerActionCreated(address: signer)
    }
  }

  // Update the threshold of signers
  pub struct UpdateThreshold: MyMultiSig.Action {
    pub let threshold: UInt
    pub let intent: String
    pub let proposer: Address

    access(account) fun execute(_ params: {String: AnyStruct}) {
      let adminRef: &ExampleToken.Admin = params["admin"]! as! &ExampleToken.Admin

      let manager = adminRef.borrowManager()
      let oldThreshold = manager.threshold
      manager.updateThreshold(newThreshold: self.threshold)
      emit UpdateThresholdActionExecuted(oldThreshold: oldThreshold, newThreshold: self.threshold, treasuryAddr: adminRef.owner!.address)
    }

    init(threshold: UInt, proposer: Address) {
      self.threshold = threshold
      self.proposer = proposer
      self.intent = "Update the threshold of signers to ".concat(threshold.toString()).concat(".")
      emit UpdateThresholdActionCreated(threshold: threshold)
    }
  }
}