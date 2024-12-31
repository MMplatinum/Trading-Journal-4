import { supabase } from './client';
import { Trade, TradeFormData } from '@/types/trade';
import { deleteTradeImage } from './storage';

export async function fetchTrades(userId: string) {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('entry_date', { ascending: false });

  if (error) throw error;
  
  return data.map(trade => ({
    id: trade.id,
    accountId: trade.account_id,
    instrumentType: trade.instrument_type,
    direction: trade.direction,
    symbol: trade.symbol,
    entryDate: trade.entry_date,
    entryTime: trade.entry_time,
    exitDate: trade.exit_date,
    exitTime: trade.exit_time,
    entryPrice: trade.entry_price,
    exitPrice: trade.exit_price,
    quantity: trade.quantity,
    realizedPL: trade.realized_pl,
    commission: trade.commission || 0,
    timeframe: trade.timeframe,
    emotionalState: trade.emotional_state,
    strategy: trade.strategy || '',
    setup: trade.setup || '',
    notes: trade.notes || '',
    entryScreenshot: trade.entry_screenshot,
    exitScreenshot: trade.exit_screenshot,
  }));
}

export async function createTrade(userId: string, trade: TradeFormData) {
  // Calculate P/L based on trade type
  let realizedPL: number | null = null;
  
  if (trade.realizedPL !== undefined) {
    // Direct P/L input
    realizedPL = trade.realizedPL;
  } else if (trade.entryPrice && trade.exitPrice && trade.quantity) {
    // Calculate from entry/exit prices
    const multiplier = trade.direction === 'LONG' ? 1 : -1;
    realizedPL = (trade.exitPrice - trade.entryPrice) * trade.quantity * multiplier;
  }

  if (realizedPL === null) {
    throw new Error('Invalid trade data: Unable to calculate P/L');
  }

  // Calculate net P/L (including commission)
  const netPL = realizedPL - (trade.commission || 0);

  // First, update the account balance
  const { error: balanceError } = await supabase.rpc(
    'update_account_balance',
    { 
      p_account_id: trade.accountId,
      p_amount: netPL
    }
  );

  if (balanceError) throw balanceError;

  // Then create the trade record
  const { data: newTrade, error: tradeError } = await supabase
    .from('trades')
    .insert([{
      user_id: userId,
      account_id: trade.accountId,
      instrument_type: trade.instrumentType,
      direction: trade.direction,
      symbol: trade.symbol,
      entry_date: trade.entryDate,
      entry_time: trade.entryTime,
      exit_date: trade.exitDate,
      exit_time: trade.exitTime,
      entry_price: trade.entryPrice,
      exit_price: trade.exitPrice,
      quantity: trade.quantity,
      realized_pl: realizedPL,
      commission: trade.commission || 0,
      timeframe: trade.timeframe,
      emotional_state: trade.emotionalState,
      strategy: trade.strategy || null,
      setup: trade.setup || null,
      notes: trade.notes || null,
      entry_screenshot: trade.entryScreenshot || null,
      exit_screenshot: trade.exitScreenshot || null,
    }])
    .select()
    .single();

  if (tradeError) throw tradeError;

  return {
    id: newTrade.id,
    accountId: newTrade.account_id,
    instrumentType: newTrade.instrument_type,
    direction: newTrade.direction,
    symbol: newTrade.symbol,
    entryDate: newTrade.entry_date,
    entryTime: newTrade.entry_time,
    exitDate: newTrade.exit_date,
    exitTime: newTrade.exit_time,
    entryPrice: newTrade.entry_price,
    exitPrice: newTrade.exit_price,
    quantity: newTrade.quantity,
    realizedPL: newTrade.realized_pl,
    commission: newTrade.commission || 0,
    timeframe: newTrade.timeframe,
    emotionalState: newTrade.emotional_state,
    strategy: newTrade.strategy || '',
    setup: newTrade.setup || '',
    notes: newTrade.notes || '',
    entryScreenshot: newTrade.entry_screenshot,
    exitScreenshot: newTrade.exit_screenshot,
  };
}

export async function updateTrade(id: string, data: Partial<Trade>) {
  // Get the original trade to calculate P/L difference
  const { data: oldTrade, error: fetchError } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchError) throw fetchError;

  // Calculate old and new P/L
  const oldPL = oldTrade.realized_pl - (oldTrade.commission || 0);
  
  let newRealizedPL = data.realizedPL;
  if (newRealizedPL === undefined && data.entryPrice && data.exitPrice && data.quantity) {
    const multiplier = (data.direction || oldTrade.direction) === 'LONG' ? 1 : -1;
    newRealizedPL = (data.exitPrice - data.entryPrice) * data.quantity * multiplier;
  }

  const newPL = (newRealizedPL ?? oldTrade.realized_pl) - (data.commission || oldTrade.commission || 0);
  const plDifference = newPL - oldPL;

  // Update account balance with the P/L difference
  if (plDifference !== 0) {
    const { error: balanceError } = await supabase.rpc(
      'update_account_balance',
      {
        p_account_id: oldTrade.account_id,
        p_amount: plDifference
      }
    );

    if (balanceError) throw balanceError;
  }

  // Update the trade
  const { data: updatedTrade, error: updateError } = await supabase
    .from('trades')
    .update({
      instrument_type: data.instrumentType,
      direction: data.direction,
      symbol: data.symbol,
      entry_date: data.entryDate,
      entry_time: data.entryTime,
      exit_date: data.exitDate,
      exit_time: data.exitTime,
      entry_price: data.entryPrice,
      exit_price: data.exitPrice,
      quantity: data.quantity,
      realized_pl: newRealizedPL,
      commission: data.commission,
      timeframe: data.timeframe,
      emotional_state: data.emotionalState,
      strategy: data.strategy,
      setup: data.setup,
      notes: data.notes,
      entry_screenshot: data.entryScreenshot,
      exit_screenshot: data.exitScreenshot,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) throw updateError;

  return {
    id: updatedTrade.id,
    accountId: updatedTrade.account_id,
    instrumentType: updatedTrade.instrument_type,
    direction: updatedTrade.direction,
    symbol: updatedTrade.symbol,
    entryDate: updatedTrade.entry_date,
    entryTime: updatedTrade.entry_time,
    exitDate: updatedTrade.exit_date,
    exitTime: updatedTrade.exit_time,
    entryPrice: updatedTrade.entry_price,
    exitPrice: updatedTrade.exit_price,
    quantity: updatedTrade.quantity,
    realizedPL: updatedTrade.realized_pl,
    commission: updatedTrade.commission || 0,
    timeframe: updatedTrade.timeframe,
    emotionalState: updatedTrade.emotional_state,
    strategy: updatedTrade.strategy || '',
    setup: updatedTrade.setup || '',
    notes: updatedTrade.notes || '',
    entryScreenshot: updatedTrade.entry_screenshot,
    exitScreenshot: updatedTrade.exit_screenshot,
  };
}

export async function deleteTrade(id: string) {
  // Get the trade to reverse its P/L effect
  const { data: tradeToDelete, error: fetchTradeError } = await supabase
    .from('trades')
    .select('*')
    .eq('id', id)
    .single();

  if (fetchTradeError) throw fetchTradeError;

  // Delete screenshots if they exist
  if (tradeToDelete.entry_screenshot) {
    await deleteTradeImage(tradeToDelete.entry_screenshot);
  }
  if (tradeToDelete.exit_screenshot) {
    await deleteTradeImage(tradeToDelete.exit_screenshot);
  }

  // Calculate net P/L to reverse
  const netPL = tradeToDelete.realized_pl - (tradeToDelete.commission || 0);

  // Reverse the P/L effect on account balance
  const { error: balanceError } = await supabase.rpc(
    'update_account_balance',
    {
      p_account_id: tradeToDelete.account_id,
      p_amount: -netPL // Negative to reverse the effect
    }
  );

  if (balanceError) throw balanceError;

  // Delete the trade
  const { error: deleteError } = await supabase
    .from('trades')
    .delete()
    .eq('id', id);

  if (deleteError) throw deleteError;
}

export async function deleteTrades(ids: string[]) {
  // Get all trades to reverse their P/L effects
  const { data: tradesToDelete, error: fetchTradesError } = await supabase
    .from('trades')
    .select('*')
    .in('id', ids);

  if (fetchTradesError) throw fetchTradesError;

  // Delete all screenshots
  for (const trade of tradesToDelete) {
    if (trade.entry_screenshot) {
      await deleteTradeImage(trade.entry_screenshot);
    }
    if (trade.exit_screenshot) {
      await deleteTradeImage(trade.exit_screenshot);
    }
  }

  // Reverse P/L effects for each trade
  for (const trade of tradesToDelete) {
    const netPL = trade.realized_pl - (trade.commission || 0);
    const { error: balanceError } = await supabase.rpc(
      'update_account_balance',
      {
        p_account_id: trade.account_id,
        p_amount: -netPL
      }
    );

    if (balanceError) throw balanceError;
  }

  // Delete all trades
  const { error: deleteError } = await supabase
    .from('trades')
    .delete()
    .in('id', ids);

  if (deleteError) throw deleteError;
}