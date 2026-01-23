import { Request, Response } from "express";
import Stripe from "stripe";
import { JwtPayload } from "jsonwebtoken";
import { Product } from "src/models/product/product-schema";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2025-02-24.acacia",
});

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
    const products = await Product.find(query).sort({ createdAt: 1 });
    
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

