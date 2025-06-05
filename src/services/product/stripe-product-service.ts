import { Request, Response } from "express";
import Stripe from "stripe";
import { JwtPayload } from "jsonwebtoken";
import { DatingSubscriptionPlan } from "src/models/subscriptions/dating-subscription-schema";
import { Product } from "src/models/product/product-schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
});

// Create a new product in Stripe and sync to DB
export const createProductService = async (req: Request, res: Response) => {
  try {
    const { 
      name, 
      description, 
      price, 
      currency = "usd", 
      interval = "month", 
      planType, 
      features = {},
      images = []
    } = req.body;

    // Validate required fields
    if (!name || !description || !price || !planType) {
      return { 
        success: false, 
        message: "Name, description, price, and planType are required" 
      };
    }

    // Validate plan type
    if (!Object.values(DatingSubscriptionPlan).includes(planType)) {
      return { 
        success: false, 
        message: `Invalid plan type. Must be one of: ${Object.values(DatingSubscriptionPlan).join(', ')}` 
      };
    }

    // Create product in Stripe
    const product = await stripe.products.create({
      name,
      description,
      images,
      metadata: {
        plan_type: planType,
        features: JSON.stringify(features),
        category: "subscription"
      }
    });

    // Create price for the product
    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(price * 100), // Convert to cents
      currency,
      recurring: {
        interval
      }
    });

    // Update product with default price
    const updatedProduct = await stripe.products.update(product.id, {
      default_price: stripePrice.id
    });

    // Format the price data for our database
    const priceData = {
      priceId: stripePrice.id,
      currency: stripePrice.currency,
      unitAmount: stripePrice.unit_amount,
      formattedAmount: `${stripePrice.currency.toUpperCase()} ${(stripePrice.unit_amount || 0) / 100}`,
      recurring: {
        interval: stripePrice.recurring?.interval || interval,
        intervalCount: stripePrice.recurring?.interval_count || 1
      },
      active: true,
      createdAt: new Date(stripePrice.created * 1000),
      updatedAt: new Date(stripePrice.created * 1000)
    };

    // Parse features from metadata
    let parsedFeatures = {};
    try {
      if (product.metadata.features) {
        parsedFeatures = JSON.parse(product.metadata.features);
      }
    } catch (error) {
      console.error("Error parsing features:", error);
    }

    // Create product in our database
    const dbProduct = await Product.create({
      productId: product.id,
      name: product.name,
      description: product.description,
      planType: product.metadata.plan_type || planType,
      category: product.metadata.category || "subscription",
      defaultPrice: priceData,
      allPrices: [priceData],
      features: parsedFeatures,
      images: product.images,
      active: product.active,
      stripeCreatedAt: new Date(product.created * 1000),
      stripeUpdatedAt: new Date(product.created * 1000),
      metadata: product.metadata
    });

    return {
      success: true,
      message: "Product created successfully",
      data: {
        product: updatedProduct,
        price: stripePrice,
        dbProduct
      }
    };
  } catch (error) {
    console.error("Error creating product:", error);
    return { 
      success: false, 
      message: `Failed to create product: ${(error as Error).message}` 
    };
  }
};

// Get all products from DB (synced with Stripe)
export const getAllProductsService = async (req: Request, res: Response) => {
  try {
    const { active, planType, syncWithStripe = 'false' } = req.query;
    
    // Build query for database
    const query: any = {};
    
    if (active !== undefined) {
      query.active = active === 'true';
    }
    
    if (planType) {
      query.planType = planType;
    }
    
    // If syncWithStripe is true, sync all products from Stripe first
    if (syncWithStripe === 'true') {
      await syncProductsFromStripe();
    }
    
    // Get products from database
    const products = await Product.find(query).sort({ createdAt: -1 });
    
    return {
      success: true,
      message: "Products retrieved successfully",
      data: products,
      total: products.length
    };
  } catch (error) {
    console.error("Error retrieving products:", error);
    return { 
      success: false, 
      message: `Failed to retrieve products: ${(error as Error).message}` 
    };
  }
};

// Get a single product by ID from DB (synced with Stripe)
export const getProductByIdService = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { syncWithStripe = 'false' } = req.query;
    
    if (!productId) {
      return { success: false, message: "Product ID is required" };
    }
    
    // If syncWithStripe is true, sync this product from Stripe first
    if (syncWithStripe === 'true') {
      await syncProductFromStripe(productId);
    }
    
    // Get product from database
    const product = await Product.findOne({ productId });
    
    if (!product) {
      return { success: false, message: "Product not found" };
    }
    
    return {
      success: true,
      message: "Product retrieved successfully",
      data: product
    };
  } catch (error) {
    console.error("Error retrieving product:", error);
    return { 
      success: false, 
      message: `Failed to retrieve product: ${(error as Error).message}` 
    };
  }
};

// Update a product in Stripe and sync to DB
export const updateProductService = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const { 
      name, 
      description, 
      price, 
      currency, 
      interval,
      planType, 
      features,
      images,
      active
    } = req.body;
    
    if (!productId) {
      return { success: false, message: "Product ID is required" };
    }
    
    // Prepare product update data
    const productUpdateData: Stripe.ProductUpdateParams = {};
    
    if (name !== undefined) productUpdateData.name = name;
    if (description !== undefined) productUpdateData.description = description;
    if (images !== undefined) productUpdateData.images = images;
    if (active !== undefined) productUpdateData.active = active;
    
    // Prepare metadata update
    const metadata: Record<string, string> = {};
    
    if (planType !== undefined) {
      // Validate plan type
      if (!Object.values(DatingSubscriptionPlan).includes(planType)) {
        return { 
          success: false, 
          message: `Invalid plan type. Must be one of: ${Object.values(DatingSubscriptionPlan).join(', ')}` 
        };
      }
      metadata.plan_type = planType;
    }
    
    if (features !== undefined) {
      metadata.features = JSON.stringify(features);
    }
    
    if (Object.keys(metadata).length > 0) {
      productUpdateData.metadata = metadata;
    }
    
    // Update product in Stripe
    const updatedProduct = await stripe.products.update(productId, productUpdateData);
    
    // Variable to store new price if created
    let newPrice = null;
    let updatedStripeProduct = updatedProduct;
    
    // If price is provided, create a new price and update default_price
    if (price !== undefined) {
      const priceData: Stripe.PriceCreateParams = {
        product: productId,
        unit_amount: Math.round(price * 100), // Convert to cents
        currency: currency || 'usd',
        recurring: {
          interval: interval || 'month'
        }
      };
      
      newPrice = await stripe.prices.create(priceData);
      
      // Update product with new default price
      updatedStripeProduct = await stripe.products.update(productId, {
        default_price: newPrice.id
      });
    }
    
    // Now update the product in our database
    const dbProduct = await Product.findOne({ productId });
    
    if (!dbProduct) {
      // If product doesn't exist in our DB, sync it from Stripe
      await syncProductFromStripe(productId);
      return {
        success: true,
        message: "Product updated in Stripe and synced to database",
        data: {
          product: updatedStripeProduct,
          newPrice
        }
      };
    }
    
    // Update basic product info
    if (name !== undefined) dbProduct.name = name;
    if (description !== undefined) dbProduct.description = description;
    if (images !== undefined) dbProduct.images = images;
    if (active !== undefined) dbProduct.active = active;
    if (planType !== undefined) dbProduct.planType = planType;
    
    // Update features if provided
    if (features !== undefined) {
      dbProduct.features = features;
    }
    
    // Update metadata
    if (Object.keys(metadata).length > 0) {
      dbProduct.metadata = {
        ...dbProduct.metadata,
        ...metadata
      };
    }
    
    // If a new price was created, update the default price and add to allPrices
    if (newPrice) {
      const priceData = {
        priceId: newPrice.id,
        currency: newPrice.currency,
        unitAmount: newPrice.unit_amount !== null ? newPrice.unit_amount : 0,
        formattedAmount: `${newPrice.currency.toUpperCase()} ${(newPrice.unit_amount !== null ? newPrice.unit_amount : 0) / 100}`,
        recurring: {
          interval: newPrice.recurring?.interval || interval || 'month',
          intervalCount: newPrice.recurring?.interval_count || 1
        },
        active: true,
        createdAt: new Date(newPrice.created * 1000),
        updatedAt: new Date(newPrice.created * 1000)
      };
      
      dbProduct.defaultPrice = priceData;
      dbProduct.allPrices.push(priceData);
    }
    
    // Update Stripe timestamps
    dbProduct.stripeUpdatedAt = new Date(updatedStripeProduct.updated * 1000);
    
    // Save the updated product
    await dbProduct.save();
    
    return {
      success: true,
      message: "Product updated successfully in Stripe and database",
      data: {
        product: updatedStripeProduct,
        newPrice,
        dbProduct
      }
    };
  } catch (error) {
    console.error("Error updating product:", error);
    return { 
      success: false, 
      message: `Failed to update product: ${(error as Error).message}` 
    };
  }
};

// Delete a product in Stripe (archive it) and update DB
export const deleteProductService = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return { success: false, message: "Product ID is required" };
    }
    
    // In Stripe, you don't actually delete products, you archive them
    const deletedProduct = await stripe.products.update(productId, {
      active: false
    });
    
    // Update the product in our database
    const dbProduct = await Product.findOneAndUpdate(
      { productId },
      { 
        active: false,
        stripeUpdatedAt: new Date(deletedProduct.updated * 1000)
      },
      { new: true }
    );
    
    return {
      success: true,
      message: "Product archived successfully in Stripe and database",
      data: {
        product: deletedProduct,
        dbProduct
      }
    };
  } catch (error) {
    console.error("Error archiving product:", error);
    return { 
      success: false, 
      message: `Failed to archive product: ${(error as Error).message}` 
    };
  }
};

// Helper function to sync all products from Stripe to our database
export const syncProductsFromStripe = async () => {
  try {
    // Get all products from Stripe
    const stripeProducts = await stripe.products.list({
      expand: ['data.default_price'],
      limit: 100 // Adjust as needed
    });
    
    // Process each product
    for (const product of stripeProducts.data) {
      await syncProductFromStripe(product.id);
    }
    
    return {
      success: true,
      message: `Synced ${stripeProducts.data.length} products from Stripe`
    };
  } catch (error) {
    console.error("Error syncing products from Stripe:", error);
    throw error;
  }
};

// Helper function to sync a single product from Stripe to our database
export const syncProductFromStripe = async (productId: string) => {
  try {
    // Get product from Stripe
    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price']
    });
    
    // Get all prices for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100 // Adjust as needed
    });
    
    // Format the default price
    const defaultPrice = product.default_price as Stripe.Price;
    let defaultPriceData = null;
    
    if (defaultPrice) {
      defaultPriceData = {
        priceId: defaultPrice.id,
        currency: defaultPrice.currency,
        unitAmount: defaultPrice.unit_amount,
        formattedAmount: `${defaultPrice.currency.toUpperCase()} ${(defaultPrice.unit_amount || 0) / 100}`,
        recurring: {
          interval: defaultPrice.recurring?.interval || 'month',
          intervalCount: defaultPrice.recurring?.interval_count || 1
        },
        active: defaultPrice.active,
        createdAt: new Date(defaultPrice.created * 1000),
        updatedAt: new Date(defaultPrice.created * 1000)
      };
    }
    
    // Format all prices
    const allPricesData = prices.data.map(price => ({
      priceId: price.id,
      currency: price.currency,
      unitAmount: price.unit_amount,
      formattedAmount: `${price.currency.toUpperCase()} ${(price.unit_amount || 0) / 100}`,
      recurring: {
        interval: price.recurring?.interval || 'month',
        intervalCount: price.recurring?.interval_count || 1
      },
      active: price.active,
      createdAt: new Date(price.created * 1000),
      updatedAt: new Date(price.created * 1000)
    }));
    
    // Parse features from metadata
    let features = {};
    try {
      if (product.metadata.features) {
        features = JSON.parse(product.metadata.features);
      }
    } catch (error) {
      console.error(`Error parsing features for product ${product.id}:`, error);
    }
    
    // Update or create the product in our database
    const dbProduct = await Product.findOneAndUpdate(
      { productId: product.id },
      {
        productId: product.id,
        name: product.name,
        description: product.description,
        planType: product.metadata.plan_type || 'UNKNOWN',
        category: product.metadata.category || 'subscription',
        defaultPrice: defaultPriceData,
        allPrices: allPricesData,
        features,
        images: product.images,
        active: product.active,
        stripeCreatedAt: new Date(product.created * 1000),
        stripeUpdatedAt: new Date(product.updated * 1000),
        metadata: product.metadata
      },
      { upsert: true, new: true }
    );
    
    return dbProduct;
  } catch (error) {
    console.error(`Error syncing product ${productId} from Stripe:`, error);
    throw error;
  }
};

// Add a controller to manually sync all products
export const syncAllProductsService = async (req: Request, res: Response) => {
  try {
    const result = await syncProductsFromStripe();
    
    return {
      success: true,
      message: result.message,
      data: { synced: true }
    };
  } catch (error) {
    console.error("Error in sync all products service:", error);
    return { 
      success: false, 
      message: `Failed to sync products: ${(error as Error).message}` 
    };
  }
};

